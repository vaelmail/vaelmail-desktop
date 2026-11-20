use tauri::{AppHandle, Manager, WindowEvent};

use crate::state::AppState;

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        let close_to_tray = app.state::<AppState>().settings().close_to_tray;
        if close_to_tray {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

pub fn started_hidden() -> bool {
    std::env::args().any(|argument| argument == "--hidden")
}
