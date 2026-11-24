use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use reqwest::header::{COOKIE, ORIGIN, USER_AGENT};
use serde_json::Value;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot, watch};
use tokio::time::{interval, sleep, timeout};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::{Error as SocketError, Message};
use tokio_tungstenite::{client_async_tls_with_config, MaybeTlsStream, WebSocketStream};

use super::protocol::{self, RpcResponse, Subscription};
use super::{Command, Event, Status, TransportState};
use crate::config::{
    HEARTBEAT_WATCHDOG_SECS, ORIGIN as SITE_ORIGIN, REALTIME_URL, SOCKET_FRAME_LIMIT,
};
use crate::http::{open_tunnel, Client};

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type Sink = SplitSink<Socket, Message>;
type Source = SplitStream<Socket>;

const WATCHDOG_TICK: Duration = Duration::from_secs(5);
const FALLBACK_INTERVAL: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const SESSION_CLOSE_CODES: [u16; 2] = [4401, 4403];

struct Pending {
    read: bool,
    reply: oneshot::Sender<Option<RpcResponse>>,
}

enum Exit {
    SessionEnded,
    Stopped,
    Dropped,
    Rejected,
    Challenged(u8),
    Forbidden,
}

struct Shared {
    client: Arc<Client>,
    events: mpsc::UnboundedSender<Event>,
    state: watch::Sender<TransportState>,
    subscriptions: Vec<Subscription>,
    pending: HashMap<String, Pending>,
}

impl Shared {
    fn emit(&self, event: Event) {
        let _ = self.events.send(event);
    }

    fn settle(&mut self, next: TransportState) {
        self.state.send_replace(next);
    }

    fn fail_pending(&mut self) {
        for (_, pending) in self.pending.drain() {
            let outcome = if pending.read {
                None
            } else {
                Some(RpcResponse::uncertain(protocol::LOST_MESSAGE))
            };
            let _ = pending.reply.send(outcome);
        }
    }

    fn handle_idle(&mut self, command: Command) -> bool {
        match command {
            Command::Subscribe(queries) => {
                self.store(queries);
            }
            Command::Request { reply, read, .. } => {
                let _ = reply.send(if read {
                    None
                } else {
                    Some(RpcResponse::uncertain(protocol::LOST_MESSAGE))
                });
            }
            Command::Stop => return true,
            Command::Cancel { .. } | Command::Forget(_) | Command::Reconnect => {}
        }
        false
    }

    fn store(&mut self, mut queries: Vec<Subscription>) -> bool {
        queries.truncate(protocol::MAX_SUBSCRIPTIONS);
        let changed = queries != self.subscriptions;
        self.subscriptions = queries;
        changed
    }
}

async fn connect(client: &Client) -> Result<Socket, SocketError> {
    let mut request = REALTIME_URL.into_client_request()?;
    let headers = request.headers_mut();
    headers.insert(ORIGIN, SITE_ORIGIN.parse().unwrap());
    if let Ok(agent) = client.agent().parse() {
        headers.insert(USER_AGENT, agent);
    }
    if let Some(cookie) = client.cookie_header().and_then(|value| value.parse().ok()) {
        headers.insert(COOKIE, cookie);
    }
    let proxy = client.tunnel_proxy();
    let stream = open_tunnel(proxy.as_ref(), "vaelmail.com", 443)
        .await
        .map_err(|_| SocketError::ConnectionClosed)?;
    let config = WebSocketConfig::default()
        .max_message_size(Some(SOCKET_FRAME_LIMIT))
        .max_frame_size(Some(SOCKET_FRAME_LIMIT));
    let (socket, _) = client_async_tls_with_config(request, stream, Some(config), None).await?;
    Ok(socket)
}

fn rejection(error: &SocketError) -> Exit {
    let SocketError::Http(response) = error else {
        return Exit::Dropped;
    };
    let level = crate::http::challenge_level(response.headers());
    if level > 0 {
        return Exit::Challenged(level);
    }
    match response.status().as_u16() {
        401 => Exit::SessionEnded,
        403 => Exit::Forbidden,
        _ => Exit::Rejected,
    }
}

async fn session_lost(client: &Client) -> bool {
    matches!(
        client.send(&crate::http::Request::get("/api/account")).await,
        Ok(response) if response.status == 401
    )
}

async fn send(sink: &mut Sink, text: String) -> bool {
    sink.send(Message::text(text)).await.is_ok()
}

struct Greeting {
    rpc: bool,
    snapshots: bool,
    revision: i64,
}

async fn serve(
    shared: &mut Shared,
    socket: Socket,
    commands: &mut mpsc::UnboundedReceiver<Command>,
) -> Exit {
    let (mut sink, mut source): (Sink, Source) = socket.split();
    let mut greeting = Greeting {
        rpc: false,
        snapshots: false,
        revision: -1,
    };
    let mut heartbeat = Instant::now();
    let mut watchdog = interval(WATCHDOG_TICK);

    let exit = loop {
        tokio::select! {
            frame = source.next() => match frame {
                None => break Exit::Dropped,
                Some(Err(_)) => break Exit::Dropped,
                Some(Ok(Message::Close(frame))) => {
                    let code = frame.map(|f| u16::from(f.code));
                    break if code.is_some_and(|c| SESSION_CLOSE_CODES.contains(&c)) {
                        Exit::SessionEnded
                    } else {
                        Exit::Dropped
                    };
                }
                Some(Ok(Message::Text(text))) => {
                    if text.len() > SOCKET_FRAME_LIMIT {
                        continue;
                    }
                    let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
                    if on_frame(shared, &mut sink, &mut greeting, &mut heartbeat, value).await.is_err() {
                        break Exit::Dropped;
                    }
                }
                Some(Ok(_)) => {}
            },
            command = commands.recv() => match command {
                None | Some(Command::Stop) => break Exit::Stopped,
                Some(Command::Reconnect) => break Exit::Dropped,
                Some(command) => {
                    if on_command(shared, &mut sink, &greeting, command).await.is_err() {
                        break Exit::Dropped;
                    }
                }
            },
            _ = watchdog.tick() => {
                if heartbeat.elapsed() > Duration::from_secs(HEARTBEAT_WATCHDOG_SECS) {
                    break Exit::Dropped;
                }
            }
        }
    };
    let _ = sink.close().await;
    exit
}

async fn on_frame(
    shared: &mut Shared,
    sink: &mut Sink,
    greeting: &mut Greeting,
    heartbeat: &mut Instant,
    frame: Value,
) -> Result<(), ()> {
    if frame.get("version").and_then(Value::as_i64) != Some(protocol::VERSION) {
        return Ok(());
    }
    let kind = frame.get("type").and_then(Value::as_str).unwrap_or("");
    match kind {
        "response" => {
            let id = frame.get("id").and_then(Value::as_str);
            let status = frame.get("status").and_then(Value::as_u64);
            if let (Some(id), Some(status)) = (id, status) {
                if let Some(pending) = shared.pending.remove(id) {
                    let _ = pending.reply.send(Some(RpcResponse {
                        status: status as u16,
                        value: frame.get("value").cloned().unwrap_or(Value::Null),
                    }));
                }
            }
        }
        "ready" | "heartbeat" => {
            *heartbeat = Instant::now();
            shared.emit(Event::Status(Status::Connected));
            if kind == "ready" {
                greeting.rpc = frame.get("rpc").and_then(Value::as_bool) == Some(true);
                greeting.snapshots = frame.get("snapshots").and_then(Value::as_bool) == Some(true);
                greeting.revision = -1;
                shared.settle(if greeting.rpc {
                    TransportState::Ready
                } else {
                    TransportState::Down
                });
                if greeting.rpc && !shared.subscriptions.is_empty() {
                    let text = protocol::subscribe_frame(&shared.subscriptions);
                    if !send(sink, text).await {
                        return Err(());
                    }
                }
                if !greeting.snapshots {
                    shared.emit(Event::Refresh(None));
                }
            }
        }
        "mailbox.snapshot" => {
            let revision = frame.get("revision").and_then(Value::as_i64);
            if let Some(revision) = revision.filter(|r| *r >= greeting.revision) {
                if protocol::is_snapshot(&frame) {
                    greeting.revision = revision;
                    shared.emit(Event::Snapshot(frame));
                }
            }
        }
        "reconcile" => shared.emit(Event::Refresh(None)),
        "mailbox.changed" => {
            let revision = frame.get("revision").and_then(Value::as_i64);
            if let Some(revision) = revision.filter(|r| *r > greeting.revision) {
                if !greeting.snapshots {
                    greeting.revision = revision;
                    let scopes = frame.get("scopes").and_then(Value::as_array).map(|list| {
                        list.iter()
                            .filter_map(|scope| scope.as_str().map(str::to_owned))
                            .collect()
                    });
                    shared.emit(Event::Refresh(scopes));
                }
            }
        }
        _ => {}
    }
    Ok(())
}

async fn on_command(
    shared: &mut Shared,
    sink: &mut Sink,
    greeting: &Greeting,
    command: Command,
) -> Result<(), ()> {
    match command {
        Command::Subscribe(queries) => {
            if shared.store(queries) && greeting.rpc {
                let text = protocol::subscribe_frame(&shared.subscriptions);
                if !send(sink, text).await {
                    return Err(());
                }
            }
        }
        Command::Request {
            id,
            path,
            method,
            body,
            generation,
            read,
            reply,
        } => {
            if !greeting.rpc {
                let _ = reply.send(None);
                return Ok(());
            }
            let text = protocol::request_frame(&id, &path, &method, body.as_ref(), generation);
            shared.pending.insert(id, Pending { read, reply });
            if !send(sink, text).await {
                return Err(());
            }
        }
        Command::Cancel { id, read } => {
            if let Some(pending) = shared.pending.remove(&id) {
                if read && pending.read {
                    let _ = send(sink, protocol::cancel_frame(&id)).await;
                }
                let _ = pending.reply.send(None);
            }
        }
        Command::Forget(id) => {
            shared.pending.remove(&id);
        }
        Command::Reconnect | Command::Stop => {}
    }
    Ok(())
}

fn backoff(attempt: u32) -> Duration {
    let base = 1000u64 << attempt.min(5);
    let jitter = 0.8 + (uuid::Uuid::new_v4().as_u128() % 400) as f64 / 1000.0;
    Duration::from_millis(((base.min(30_000)) as f64 * jitter) as u64)
}

pub async fn run(
    client: Arc<Client>,
    events: mpsc::UnboundedSender<Event>,
    mut commands: mpsc::UnboundedReceiver<Command>,
    state: watch::Sender<TransportState>,
) {
    let mut shared = Shared {
        client: client.clone(),
        events,
        state,
        subscriptions: Vec::new(),
        pending: HashMap::new(),
    };
    let mut attempt = 0u32;

    loop {
        shared.settle(TransportState::Pending);
        shared.emit(Event::Status(Status::Connecting));

        let connected = timeout(CONNECT_TIMEOUT, connect(&shared.client)).await;
        let exit = match connected {
            Ok(Ok(socket)) => {
                attempt = 0;
                serve(&mut shared, socket, &mut commands).await
            }
            Ok(Err(error)) => rejection(&error),
            Err(_) => Exit::Dropped,
        };
        let exit = match exit {
            Exit::Forbidden if session_lost(&shared.client).await => Exit::SessionEnded,
            Exit::Forbidden => Exit::Rejected,
            Exit::Challenged(level) => {
                if shared.client.clear_challenge(level).await {
                    continue;
                }
                Exit::Rejected
            }
            other => other,
        };

        shared.settle(TransportState::Down);
        shared.fail_pending();

        match exit {
            Exit::Stopped => return,
            Exit::SessionEnded => {
                shared.emit(Event::SessionEnded);
                return;
            }
            Exit::Dropped | Exit::Rejected | Exit::Challenged(_) | Exit::Forbidden => {}
        }

        shared.emit(Event::Status(Status::Polling));
        shared.emit(Event::Refresh(None));
        let wait = backoff(attempt).max(if matches!(exit, Exit::Rejected) {
            FALLBACK_INTERVAL
        } else {
            Duration::ZERO
        });
        attempt = attempt.saturating_add(1);

        let pause = sleep(wait);
        tokio::pin!(pause);
        loop {
            tokio::select! {
                _ = &mut pause => break,
                command = commands.recv() => match command {
                    None => return,
                    Some(Command::Reconnect) => break,
                    Some(command) => {
                        if shared.handle_idle(command) {
                            return;
                        }
                    }
                },
            }
        }
    }
}
