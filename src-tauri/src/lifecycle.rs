use std::time::Duration;

use tauri::{AppHandle, Manager, WindowEvent};

use crate::state::AppState;

const SHOW_FALLBACK: Duration = Duration::from_secs(8);
const EXIT_GRACE: Duration = Duration::from_secs(4);

pub fn create_main(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window("main") {
        return Ok(window);
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .cloned()
        .ok_or(tauri::Error::WindowNotFound)?;
    let mut builder = tauri::WebviewWindowBuilder::from_config(app, &config)?;
    if let Some(folder) = crate::portable::folder("webview") {
        builder = builder.data_directory(folder);
    }
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 21.0));
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false);
    }
    builder.build()
}

pub fn show_main(app: &AppHandle) {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => match create_main(app) {
            Ok(window) => window,
            Err(error) => {
                log::error!("the main window could not be created again: {error}");
                return;
            }
        },
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

pub fn show_soon(app: &AppHandle) {
    if started_hidden() {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SHOW_FALLBACK).await;
        let hidden = app
            .get_webview_window("main")
            .is_none_or(|window| !window.is_visible().unwrap_or(false));
        if hidden
            && !app
                .state::<AppState>()
                .shown
                .load(std::sync::atomic::Ordering::Relaxed)
        {
            log::warn!("the interface did not report ready in time, showing the window anyway");
            show_main(&app);
        }
    });
}

pub fn quit(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Some(realtime) = state.realtime.lock().unwrap().take() {
        realtime.stop();
    }
    crate::verification::save(&state);
    std::thread::spawn(|| {
        std::thread::sleep(EXIT_GRACE);
        std::process::exit(0);
    });
    app.exit(0);
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        api.prevent_close();
        if app.state::<AppState>().settings().close_to_tray && app.tray_by_id("main").is_some() {
            let _ = window.hide();
        } else {
            quit(app);
        }
    }
}

pub fn started_hidden() -> bool {
    std::env::args().any(|argument| argument == "--hidden")
}

pub fn install_panic_log() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("crash: {info}");
        previous(info);
    }));
}
