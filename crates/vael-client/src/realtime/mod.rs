mod connection;
mod protocol;

use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tokio::sync::{mpsc, oneshot, watch};
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

use crate::config::{RPC_TIMEOUT_SECS, SOCKET_BODY_LIMIT};
use crate::http::Client;
use crate::routes;

pub use protocol::{RpcResponse, Subscription};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Connecting,
    Connected,
    Polling,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportState {
    Pending,
    Ready,
    Down,
}

#[derive(Debug)]
pub enum Event {
    Status(Status),
    Snapshot(Value),
    Refresh(Option<Vec<String>>),
    SessionEnded,
}

pub(crate) enum Command {
    Subscribe(Vec<Subscription>),
    Request {
        id: String,
        path: String,
        method: String,
        body: Option<Value>,
        generation: Option<u64>,
        read: bool,
        reply: oneshot::Sender<Option<RpcResponse>>,
    },
    Cancel {
        id: String,
        read: bool,
    },
    Forget(String),
    Reconnect,
    Stop,
}

pub struct Realtime {
    commands: mpsc::UnboundedSender<Command>,
    state: watch::Receiver<TransportState>,
    task: JoinHandle<()>,
}

pub struct SocketCall {
    pub id: String,
    pub path: String,
    pub method: String,
    pub body: Option<Value>,
    pub generation: Option<u64>,
}

impl Realtime {
    pub fn start(client: Arc<Client>, events: mpsc::UnboundedSender<Event>) -> Self {
        let (commands, inbox) = mpsc::unbounded_channel();
        let (state_tx, state) = watch::channel(TransportState::Down);
        let task = tokio::spawn(connection::run(client, events, inbox, state_tx));
        Self {
            commands,
            state,
            task,
        }
    }

    pub fn state(&self) -> TransportState {
        *self.state.borrow()
    }

    pub fn subscribe(&self, queries: Vec<Subscription>) {
        let _ = self.commands.send(Command::Subscribe(queries));
    }

    pub fn reconnect(&self) {
        let _ = self.commands.send(Command::Reconnect);
    }

    pub fn cancel(&self, id: &str) {
        let _ = self.commands.send(Command::Cancel {
            id: id.to_owned(),
            read: true,
        });
    }

    pub fn stop(&self) {
        let _ = self.commands.send(Command::Stop);
        self.task.abort();
    }

    pub fn eligible(path: &str, method: &str, body: Option<&Value>) -> bool {
        routes::socket_allowed(path, method, body)
            && body.is_none_or(|value| value.to_string().len() <= SOCKET_BODY_LIMIT)
    }

    async fn settled(&self, wait: Duration) {
        let mut state = self.state.clone();
        let _ = timeout(wait, async {
            while *state.borrow_and_update() == TransportState::Pending {
                if state.changed().await.is_err() {
                    break;
                }
            }
        })
        .await;
    }

    pub async fn call(&self, call: SocketCall) -> Option<RpcResponse> {
        let read = call.method == "GET";
        if self.state() != TransportState::Ready {
            if read {
                return None;
            }
            self.settled(Duration::from_secs(3)).await;
        }
        if self.state() != TransportState::Ready {
            return None;
        }
        let (reply, receiver) = oneshot::channel();
        let id = call.id.clone();
        self.commands
            .send(Command::Request {
                id: call.id,
                path: call.path,
                method: call.method,
                body: call.body,
                generation: call.generation,
                read,
                reply,
            })
            .ok()?;
        match timeout(Duration::from_secs(RPC_TIMEOUT_SECS), receiver).await {
            Ok(Ok(response)) => response,
            Ok(Err(_)) => None,
            Err(_) => {
                let _ = self.commands.send(Command::Forget(id));
                if read {
                    None
                } else {
                    Some(RpcResponse::uncertain(protocol::TIMEOUT_MESSAGE))
                }
            }
        }
    }
}
