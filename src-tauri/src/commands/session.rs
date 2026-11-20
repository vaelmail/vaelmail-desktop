use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::mpsc;
use vael_client::realtime::Realtime;
use vael_client::session::{self, ActionPoll, HandoffStart, Outcome};
use vael_client::ClientError;
use vael_store::secrets;

use crate::events::{self, SESSION_ENDED};
use crate::state::AppState;
use crate::{badge, mailbox};

const LAST_ACCOUNT: &str = "last-account";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub signed_in: bool,
}

pub fn start_realtime(app: &AppHandle) {
    let state = app.state::<AppState>();
    stop_realtime(&state);
    let (sender, receiver) = mpsc::unbounded_channel();
    let realtime = Realtime::start(state.client.clone(), sender);
    *state.realtime.lock().unwrap() = Some(Arc::new(realtime));
    mailbox::spawn_pump(app.clone(), receiver);
}

fn stop_realtime(state: &AppState) {
    if let Some(realtime) = state.realtime.lock().unwrap().take() {
        realtime.stop();
    }
}

fn remember(state: &AppState) {
    if let Some(token) = session::token(&state.client) {
        let _ = secrets::save_session_token(&token);
    }
}

pub fn end_local(app: &AppHandle, reason: &str) {
    let state = app.state::<AppState>();
    stop_realtime(&state);
    state.client.jar().clear();
    secrets::clear_session_token();
    if let Some(cache) = state.cache.lock().unwrap().take() {
        cache.destroy();
    }
    let _ = std::fs::remove_file(state.data_dir.join(LAST_ACCOUNT));
    state.memory_recovery.lock().unwrap().clear();
    state.arrivals.lock().unwrap().reset();
    badge::set_unread(app, 0);
    events::emit(app, SESSION_ENDED, serde_json::json!({ "reason": reason }));
}

#[tauri::command]
pub async fn session_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Status, ClientError> {
    if session::token(&state.client).is_none() {
        if let Some(token) = secrets::session_token() {
            session::restore(&state.client, &token);
        }
    }
    let signed_in = session::token(&state.client).is_some();
    if signed_in && state.realtime().is_none() {
        start_realtime(&app);
    }
    Ok(Status { signed_in })
}

#[tauri::command]
pub async fn session_start(
    account_key: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Outcome, ClientError> {
    let outcome = session::start(&state.client, &account_key).await?;
    if matches!(outcome, Outcome::SignedIn) {
        remember(&state);
        start_realtime(&app);
    }
    Ok(outcome)
}

#[tauri::command]
pub async fn session_finish(
    factor: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Outcome, ClientError> {
    let outcome = session::finish(&state.client, &factor).await?;
    if matches!(outcome, Outcome::SignedIn) {
        remember(&state);
        start_realtime(&app);
    }
    Ok(outcome)
}

#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PasskeyHandoff {
    Started { code: String, expires_in: u64 },
    Rejected { status: u16, code: String },
}

fn open_handoff(
    app: &AppHandle,
    slot: &std::sync::Mutex<Option<String>>,
    start: HandoffStart,
) -> Result<PasskeyHandoff, ClientError> {
    match start {
        HandoffStart::Started(handoff) => {
            *slot.lock().unwrap() = Some(handoff.redeem);
            app.opener()
                .open_url(&handoff.url, None::<&str>)
                .map_err(|_| ClientError::invalid("the browser could not be opened"))?;
            Ok(PasskeyHandoff::Started {
                code: handoff.code,
                expires_in: handoff.expires_in,
            })
        }
        HandoffStart::Rejected(Outcome::Rejected { status, code }) => {
            Ok(PasskeyHandoff::Rejected { status, code })
        }
        HandoffStart::Rejected(_) => Ok(PasskeyHandoff::Rejected {
            status: 0,
            code: "request_failed".into(),
        }),
    }
}

#[tauri::command]
pub async fn session_passkey_start(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<PasskeyHandoff, ClientError> {
    let start = session::handoff_start(&state.client).await?;
    open_handoff(&app, &state.handoff, start)
}

#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ActionProof {
    Waiting,
    Ready { proof: serde_json::Value },
    Rejected { status: u16, code: String },
}

#[tauri::command]
pub async fn session_action_passkey_start(
    target: serde_json::Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<PasskeyHandoff, ClientError> {
    let start = session::action_handoff_start(&state.client, target).await?;
    open_handoff(&app, &state.action_handoff, start)
}

#[tauri::command]
pub async fn session_action_passkey_poll(
    state: State<'_, AppState>,
) -> Result<ActionProof, ClientError> {
    let Some(redeem) = state.action_handoff.lock().unwrap().clone() else {
        return Ok(ActionProof::Rejected {
            status: 401,
            code: "verification_expired".into(),
        });
    };
    let result = session::action_handoff_poll(&state.client, &redeem).await?;
    if !matches!(result, ActionPoll::Waiting) {
        state.action_handoff.lock().unwrap().take();
    }
    Ok(match result {
        ActionPoll::Waiting => ActionProof::Waiting,
        ActionPoll::Ready(proof) => ActionProof::Ready { proof },
        ActionPoll::Rejected(Outcome::Rejected { status, code }) => {
            ActionProof::Rejected { status, code }
        }
        ActionPoll::Rejected(_) => ActionProof::Rejected {
            status: 0,
            code: "request_failed".into(),
        },
    })
}

#[tauri::command]
pub fn session_action_passkey_cancel(state: State<'_, AppState>) {
    state.action_handoff.lock().unwrap().take();
}

#[tauri::command]
pub async fn session_passkey_poll(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Outcome, ClientError> {
    let Some(redeem) = state.handoff.lock().unwrap().clone() else {
        return Ok(Outcome::Rejected {
            status: 401,
            code: "verification_expired".into(),
        });
    };
    let outcome = session::handoff_poll(&state.client, &redeem).await?;
    match outcome {
        Outcome::Waiting => {}
        Outcome::SignedIn => {
            state.handoff.lock().unwrap().take();
            remember(&state);
            start_realtime(&app);
        }
        _ => {
            state.handoff.lock().unwrap().take();
        }
    }
    Ok(outcome)
}

#[tauri::command]
pub fn session_passkey_cancel(state: State<'_, AppState>) {
    state.handoff.lock().unwrap().take();
}

#[tauri::command]
pub async fn session_end(app: AppHandle, state: State<'_, AppState>) -> Result<(), ClientError> {
    stop_realtime(&state);
    session::end(&state.client).await?;
    end_local(&app, "signedOut");
    Ok(())
}

pub fn last_account_path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join(LAST_ACCOUNT)
}
