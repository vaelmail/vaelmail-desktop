use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;
use vael_client::{ClientError, Request};
use vael_store::DesktopSettings;

use crate::state::AppState;
use crate::{badge, lifecycle, mail_handler, notify, portable, updates};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub webview: String,
    pub cache_size: u64,
    pub keychain: bool,
    pub packaged: &'static str,
    pub autostart: bool,
    pub mail_handler: bool,
    pub updates: bool,
    pub data_folder: Option<String>,
}

#[derive(Serialize)]
pub struct ConnectionTest {
    pub ok: bool,
    pub status: Option<u16>,
}

fn packaging() -> &'static str {
    if portable::active() {
        "portable"
    } else if std::env::var_os("APPIMAGE").is_some() {
        "appimage"
    } else if cfg!(target_os = "linux") {
        "package"
    } else {
        "installer"
    }
}

#[tauri::command]
pub fn desktop_settings_get(state: State<'_, AppState>) -> DesktopSettings {
    state.settings()
}

#[tauri::command]
pub fn desktop_settings_set(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: DesktopSettings,
) -> Result<(), ClientError> {
    state.client.set_proxy(&settings.proxy)?;
    if !portable::active() {
        let launcher = app.autolaunch();
        if launcher.is_enabled().unwrap_or(false) != settings.autostart {
            let _ = if settings.autostart {
                launcher.enable()
            } else {
                launcher.disable()
            };
        }
    }
    state
        .settings_file
        .save(&settings)
        .map_err(|_| ClientError::invalid("the settings could not be saved"))?;
    *state.settings.write().unwrap() = settings;
    badge::refresh(&app);
    Ok(())
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_owned(),
        arch: std::env::consts::ARCH.to_owned(),
        webview: tauri::webview_version().unwrap_or_default(),
        cache_size: state
            .cache
            .lock()
            .unwrap()
            .as_ref()
            .map_or(0, vael_store::Cache::size),
        keychain: vael_store::secrets::available(),
        packaged: packaging(),
        autostart: !portable::active(),
        mail_handler: mail_handler::supported(),
        updates: updates::supported(),
        data_folder: portable::root().map(|root| root.display().to_string()),
    }
}

#[tauri::command]
pub fn notification_permission(app: AppHandle) -> &'static str {
    notify::permission(&app)
}

#[tauri::command]
pub fn notification_request(app: AppHandle) -> &'static str {
    notify::request_permission(&app)
}

#[tauri::command]
pub fn notification_test(app: AppHandle) {
    notify::show(&app, "VaelMail", "Notifications are working.");
}

#[tauri::command]
pub fn notification_pause(app: AppHandle, minutes: Option<u64>) {
    notify::pause(&app, minutes);
}

#[tauri::command]
pub fn focus_main(app: AppHandle) {
    lifecycle::show_main(&app);
}

#[tauri::command]
pub fn mail_handler_register(app: AppHandle) -> bool {
    mail_handler::register(&app)
}

#[tauri::command]
pub async fn connection_test(state: State<'_, AppState>) -> Result<ConnectionTest, ClientError> {
    match state.client.send(&Request::get("/api/account")).await {
        Ok(response) => Ok(ConnectionTest {
            ok: true,
            status: Some(response.status),
        }),
        Err(ClientError::Offline) => Ok(ConnectionTest {
            ok: false,
            status: None,
        }),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub fn frontend_ready(app: AppHandle) {
    if !lifecycle::started_hidden() {
        lifecycle::show_main(&app);
    }
}

#[tauri::command]
pub fn mailto_take(state: State<'_, AppState>) -> Vec<vael_client::mailto::Mailto> {
    std::mem::take(&mut *state.pending_mailto.lock().unwrap())
}
