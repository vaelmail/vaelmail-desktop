use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::UpdaterExt;

use crate::events::{self, UPDATES_AVAILABLE, UPDATES_PROGRESS};
use crate::state::AppState;

pub const UPDATER_KEY: Option<&str> = option_env!("VAEL_UPDATER_PUBKEY");
const AUTO_CHECK_DELAY: Duration = Duration::from_secs(20);
const FEED: &str =
    "https://github.com/vaelmail/vaelmail-desktop/releases/latest/download/latest.json";

#[derive(Serialize, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
}

fn failure(message: &str) -> String {
    message.to_owned()
}

fn updater(app: &AppHandle, state: &AppState) -> Result<tauri_plugin_updater::Updater, String> {
    let key = UPDATER_KEY.ok_or_else(|| failure("Updates are not available in this build."))?;
    let endpoint = url::Url::parse(FEED).map_err(|_| failure("The update address is invalid."))?;
    let mut builder = app
        .updater_builder()
        .pubkey(key)
        .endpoints(vec![endpoint])
        .map_err(|_| failure("The update address is invalid."))?;
    if let Some(proxy) = state.client.tunnel_proxy() {
        builder = builder.proxy(proxy);
    }
    builder
        .build()
        .map_err(|_| failure("The updater could not start."))
}

pub fn supported() -> bool {
    UPDATER_KEY.is_some()
        && !crate::portable::active()
        && (cfg!(not(target_os = "linux")) || std::env::var_os("APPIMAGE").is_some())
}

#[tauri::command]
pub fn updates_supported() -> bool {
    supported()
}

pub fn spawn_auto_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(AUTO_CHECK_DELAY).await;
        let state = app.state::<AppState>();
        if !supported() || !state.settings().updates.auto {
            return;
        }
        if let Ok(Some(info)) = check(&app, &state).await {
            events::emit(&app, UPDATES_AVAILABLE, info);
        }
    });
}

async fn check(app: &AppHandle, state: &AppState) -> Result<Option<UpdateInfo>, String> {
    let updater = updater(app, state)?;
    let found = updater
        .check()
        .await
        .map_err(|_| failure("Could not check for updates."))?;
    let info = found.as_ref().map(|update| UpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
    });
    *state.update.lock().unwrap() = found;
    Ok(info)
}

#[tauri::command]
pub async fn updates_check(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<UpdateInfo>, String> {
    check(&app, &state).await
}

#[tauri::command]
pub async fn updates_install(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let update = state
        .update
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| failure("There is no update to install."))?;
    let mut received = 0usize;
    let progress_app = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                received += chunk;
                events::emit(
                    &progress_app,
                    UPDATES_PROGRESS,
                    serde_json::json!({ "received": received, "total": total }),
                );
            },
            || {},
        )
        .await
        .map_err(|_| failure("The update could not be installed."))?;
    app.restart()
}
