use std::sync::atomic::Ordering;

use tauri::image::Image;
use tauri::{AppHandle, Manager};

use crate::state::AppState;
use crate::tray;

const OVERLAYS: [&[u8]; 10] = [
    include_bytes!("../icons/overlay/1.png"),
    include_bytes!("../icons/overlay/2.png"),
    include_bytes!("../icons/overlay/3.png"),
    include_bytes!("../icons/overlay/4.png"),
    include_bytes!("../icons/overlay/5.png"),
    include_bytes!("../icons/overlay/6.png"),
    include_bytes!("../icons/overlay/7.png"),
    include_bytes!("../icons/overlay/8.png"),
    include_bytes!("../icons/overlay/9.png"),
    include_bytes!("../icons/overlay/9plus.png"),
];

fn overlay(unread: i64) -> Option<Image<'static>> {
    if unread <= 0 {
        return None;
    }
    let index = (unread.min(10) - 1) as usize;
    Image::from_bytes(OVERLAYS[index]).ok()
}

pub fn set_unread(app: &AppHandle, unread: i64) {
    let state = app.state::<AppState>();
    state.unread.store(unread.max(0), Ordering::Relaxed);
    refresh(app);
}

pub fn refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let unread = state.unread.load(Ordering::Relaxed);
    let offline = !state.online.load(Ordering::Relaxed);
    let show_dot = state.settings().tray_unread_dot;
    tray::update(app, if show_dot { unread } else { 0 }, offline);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_badge_count(if unread > 0 { Some(unread) } else { None });
        #[cfg(target_os = "windows")]
        let _ = window.set_overlay_icon(overlay(unread));
        #[cfg(not(target_os = "windows"))]
        let _ = overlay(unread);
    }
}
