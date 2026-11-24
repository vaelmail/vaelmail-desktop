#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod platform;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

pub const PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.bin"));

pub fn version() -> &'static str {
    option_env!("VAEL_SETUP_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Info {
    platform: &'static str,
    version: &'static str,
    default_dir: Option<String>,
    installed: Option<String>,
    payload: bool,
    size: u64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub dir: Option<String>,
    pub desktop: bool,
    pub autostart: bool,
}

#[derive(Serialize, Clone)]
pub struct Progress {
    pub percent: f32,
    pub label: String,
}

pub struct Reporter(AppHandle);

impl Reporter {
    pub fn step(&self, percent: f32, label: &str) {
        let _ = self.0.emit(
            "setup:progress",
            Progress {
                percent: percent.clamp(0.0, 100.0),
                label: label.to_owned(),
            },
        );
    }
}

#[tauri::command]
fn setup_info() -> Info {
    Info {
        platform: platform::NAME,
        version: version(),
        default_dir: platform::default_dir().map(|path| path.display().to_string()),
        installed: platform::installed().map(|path| path.display().to_string()),
        payload: !PAYLOAD.is_empty(),
        size: PAYLOAD.len() as u64,
    }
}

#[tauri::command]
async fn setup_choose_dir(app: AppHandle, current: Option<String>) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Choose where to install VaelMail");
    if let Some(current) = current {
        dialog = dialog.set_directory(current);
    }
    dialog
        .blocking_pick_folder()
        .and_then(|folder| folder.into_path().ok())
        .map(|path| path.join("VaelMail").display().to_string())
}

#[tauri::command]
async fn setup_install(app: AppHandle, options: Options) -> Result<String, String> {
    if PAYLOAD.is_empty() {
        return Err("This copy of VaelMail Setup does not contain the app. Download it again from vaelmail.com.".into());
    }
    let reporter = Reporter(app.clone());
    tauri::async_runtime::spawn_blocking(move || platform::install(&options, &reporter))
        .await
        .map_err(|_| "Setup stopped unexpectedly.".to_owned())?
        .map(|path| path.display().to_string())
}

#[tauri::command]
async fn setup_uninstall(app: AppHandle) -> Result<(), String> {
    let reporter = Reporter(app);
    tauri::async_runtime::spawn_blocking(move || platform::uninstall(&reporter))
        .await
        .map_err(|_| "Setup stopped unexpectedly.".to_owned())?
}

#[tauri::command]
fn setup_launch(path: String) -> Result<(), String> {
    platform::launch(std::path::Path::new(&path))
}

#[tauri::command]
fn setup_fallback(app: AppHandle) -> Result<(), String> {
    platform::fallback()?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn setup_close(app: AppHandle) {
    app.exit(0);
}

fn main() {
    if platform::needs_fallback() && platform::fallback().is_ok() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("setup") {
                platform::decorate(&window);
                let _ = window.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            setup_info,
            setup_choose_dir,
            setup_install,
            setup_uninstall,
            setup_launch,
            setup_fallback,
            setup_close,
        ])
        .run(tauri::generate_context!())
        .expect("VaelMail Setup could not start");
}
