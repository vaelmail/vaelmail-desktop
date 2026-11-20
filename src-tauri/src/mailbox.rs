use std::sync::atomic::Ordering;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;
use vael_client::arrivals;
use vael_client::realtime::{Event, Status};
use vael_client::{Client, Request};

use crate::commands::session::end_local;
use crate::events::{self, MAIL_ARRIVED, REALTIME_REFRESH, REALTIME_SNAPSHOT, REALTIME_STATUS};
use crate::state::AppState;
use crate::{badge, notify};

fn count(counts: &Value, key: &str) -> Option<i64> {
    counts.get(key).and_then(Value::as_i64)
}

pub fn observe(app: &AppHandle, bootstrap: &Value, inbox: Option<&Value>) {
    let state = app.state::<AppState>();

    if let Some(enabled) = bootstrap
        .pointer("/mailbox/settings/desktopNotifications")
        .and_then(Value::as_bool)
    {
        state.server_notifications.store(enabled, Ordering::Relaxed);
    }
    if let Some(list) = bootstrap.pointer("/resources/services") {
        *state.services.lock().unwrap() =
            arrivals::services(&serde_json::json!({ "services": list }));
    }
    let Some(counts) = bootstrap.get("counts") else {
        return;
    };
    if let Some(unread) = count(counts, "inbox") {
        badge::set_unread(app, unread);
    }
    let (Some(total), Some(inbox)) = (count(counts, "all"), inbox) else {
        return;
    };

    let items = arrivals::items(inbox);
    let services = state.services.lock().unwrap();
    let fresh = state
        .arrivals
        .lock()
        .unwrap()
        .reconcile(total, &items, &services);
    if !fresh.is_empty() {
        events::emit(app, MAIL_ARRIVED, fresh.len());
        notify::arrivals(app, &fresh);
    }
}

fn set_online(app: &AppHandle, online: bool) {
    let state = app.state::<AppState>();
    if state.online.swap(online, Ordering::Relaxed) != online {
        events::emit(app, events::NETWORK_ONLINE, online);
        badge::refresh(app);
    }
}

pub fn note_network(app: &AppHandle, online: bool) {
    set_online(app, online);
    if !online {
        spawn_probe(app.clone());
    }
}

fn spawn_probe(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut wait = 5;
        loop {
            tokio::time::sleep(Duration::from_secs(wait)).await;
            let state = app.state::<AppState>();
            if state.online.load(Ordering::Relaxed) {
                return;
            }
            if state
                .client
                .send(&Request::get("/api/account"))
                .await
                .is_ok()
            {
                set_online(&app, true);
                if let Some(realtime) = state.realtime() {
                    realtime.reconnect();
                }
                return;
            }
            wait = (wait * 2).min(30);
        }
    });
}

async fn poll(app: &AppHandle, client: &Client) {
    let bootstrap = client.send(&Request::get("/api/webmail/bootstrap")).await;
    let inbox = client
        .send(&Request::get("/api/webmail/mail?view=inbox&limit=30"))
        .await;
    match (bootstrap, inbox) {
        (Ok(bootstrap), Ok(inbox)) if bootstrap.ok() && inbox.ok() => {
            set_online(app, true);
            observe(app, &bootstrap.value(), Some(&inbox.value()));
        }
        (Ok(response), _) if response.status == 401 => end_local(app, "expired"),
        (Err(vael_client::ClientError::Offline), _) => note_network(app, false),
        _ => {}
    }
}

pub fn spawn_pump(app: AppHandle, mut events: mpsc::UnboundedReceiver<Event>) {
    tauri::async_runtime::spawn(async move {
        let mut polling = false;
        while let Some(event) = events.recv().await {
            match event {
                Event::Status(status) => {
                    polling = status == Status::Polling;
                    if status == Status::Connected {
                        set_online(&app, true);
                    }
                    events::emit(&app, REALTIME_STATUS, status);
                }
                Event::Snapshot(frame) => {
                    if let (Some(bootstrap), Some(inbox)) =
                        (frame.get("bootstrap"), frame.get("inbox"))
                    {
                        observe(&app, bootstrap, Some(inbox));
                    }
                    events::emit(&app, REALTIME_SNAPSHOT, frame);
                }
                Event::Refresh(scopes) => {
                    if polling {
                        let client = app.state::<AppState>().client.clone();
                        poll(&app, &client).await;
                    }
                    events::emit(
                        &app,
                        REALTIME_REFRESH,
                        serde_json::json!({ "scopes": scopes }),
                    );
                }
                Event::SessionEnded => end_local(&app, "revoked"),
            }
        }
    });
}
