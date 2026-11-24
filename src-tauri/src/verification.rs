use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use vael_client::http::{Answer, Verification, CLEARANCE_COOKIES};
use vael_client::Client;

use crate::events::{self, VERIFICATION};
use crate::state::AppState;

const FILE: &str = "clearance.json";
const MAX_AGE_SECS: u64 = 12 * 60 * 60;
const FIRST_WARM: Duration = Duration::from_secs(4);
const WARM_EVERY: Duration = Duration::from_secs(40 * 60);

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    name: String,
    value: String,
    saved_at: u64,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

fn path(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join(FILE)
}

pub fn restore(state: &AppState) {
    let Ok(bytes) = std::fs::read(path(state)) else {
        return;
    };
    let Ok(saved) = serde_json::from_slice::<Vec<Saved>>(&bytes) else {
        return;
    };
    let fresh = now().saturating_sub(MAX_AGE_SECS);
    for cookie in saved {
        if cookie.saved_at >= fresh && CLEARANCE_COOKIES.contains(&cookie.name.as_str()) {
            state.client.jar().set(&cookie.name, &cookie.value);
        }
    }
}

pub fn save(state: &AppState) {
    let saved: Vec<Saved> = CLEARANCE_COOKIES
        .iter()
        .filter_map(|name| {
            state.client.jar().get(name).map(|value| Saved {
                name: (*name).to_owned(),
                value,
                saved_at: now(),
            })
        })
        .collect();
    if saved.is_empty() {
        let _ = std::fs::remove_file(path(state));
        return;
    }
    if let Ok(bytes) = serde_json::to_vec(&saved) {
        let _ = std::fs::write(path(state), bytes);
    }
}

pub fn install(app: &AppHandle) {
    let state = app.state::<AppState>();
    restore(&state);
    let handle = app.clone();
    state.client.observe_verification(move |progress| {
        if progress == Verification::Done {
            save(&handle.state::<AppState>());
        }
        events::emit(&handle, VERIFICATION, progress);
    });
    let client: Arc<Client> = state.client.clone();
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_WARM).await;
        loop {
            client.warm().await;
            save(&handle.state::<AppState>());
            tokio::time::sleep(WARM_EVERY).await;
        }
    });
}

#[tauri::command]
pub fn verification_reply(state: State<'_, AppState>, action: String, code: Option<String>) {
    let answer = match action.as_str() {
        "code" => Answer::Code(code.unwrap_or_default().chars().take(16).collect()),
        "image" => Answer::NewImage,
        _ => Answer::Cancel,
    };
    state.client.answer_verification(answer);
}
