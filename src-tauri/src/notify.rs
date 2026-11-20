use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use notify_rust::{Notification, NotificationResponse};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::{NotificationExt, PermissionState};
use vael_client::arrivals::Item;

use crate::events::{self, NOTIFICATION_ACTIVATED};
use crate::lifecycle;
#[cfg(target_os = "windows")]
use crate::portable;
use crate::state::AppState;

fn paused(state: &AppState) -> bool {
    let mut until = state.paused_until.lock().unwrap();
    match *until {
        Some(deadline) if Instant::now() < deadline => true,
        Some(_) => {
            *until = None;
            false
        }
        None => false,
    }
}

pub fn pause(app: &AppHandle, minutes: Option<u64>) {
    let state = app.state::<AppState>();
    *state.paused_until.lock().unwrap() =
        minutes.map(|minutes| Instant::now() + Duration::from_secs(minutes * 60));
}

pub fn window_in_front(app: &AppHandle) -> bool {
    app.get_webview_window("main").is_some_and(|window| {
        window.is_visible().unwrap_or(false)
            && window.is_focused().unwrap_or(false)
            && !window.is_minimized().unwrap_or(false)
    })
}

pub fn arrivals(app: &AppHandle, items: &[&Item]) {
    if items.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    let settings = state.settings();
    if !settings.notifications.enabled
        || !state.server_notifications.load(Ordering::Relaxed)
        || paused(&state)
        || window_in_front(app)
    {
        return;
    }
    let (title, body) = if items.len() == 1 && settings.notifications.show_sender {
        let item = items[0];
        (item.sender_label().to_owned(), item.subject.clone())
    } else if items.len() == 1 {
        ("VaelMail".to_owned(), "1 new message received".to_owned())
    } else {
        (
            "VaelMail".to_owned(),
            format!("{} new messages received", items.len()),
        )
    };
    let thread = if items.len() == 1 {
        items[0].thread_id.clone()
    } else {
        None
    };
    deliver(app, &title, &body, Some(thread));
}

pub fn show(app: &AppHandle, title: &str, body: &str) {
    deliver(app, title, body, None);
}

pub fn init(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = notify_rust::set_application(&app.config().identifier);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
}

#[cfg(target_os = "windows")]
fn identify(notification: &mut Notification, app: &AppHandle) {
    const UNREGISTERED: &str =
        "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";
    if portable::active() || cfg!(debug_assertions) {
        notification.app_id(UNREGISTERED);
    } else {
        notification.app_id(&app.config().identifier);
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn identify(notification: &mut Notification, _app: &AppHandle) {
    notification.action("default", "Open");
}

#[cfg(target_os = "macos")]
fn identify(_notification: &mut Notification, _app: &AppHandle) {}

fn build(app: &AppHandle, title: &str, body: &str) -> Notification {
    let mut notification = Notification::new();
    notification
        .summary(title)
        .body(body)
        .appname(&app.package_info().name);
    identify(&mut notification, app);
    notification
}

fn activate(app: &AppHandle, target: Option<Option<String>>) {
    lifecycle::show_main(app);
    if let Some(thread) = target {
        events::emit(
            app,
            NOTIFICATION_ACTIVATED,
            serde_json::json!({ "threadId": thread }),
        );
    }
}

fn deliver(app: &AppHandle, title: &str, body: &str, target: Option<Option<String>>) {
    let notification = build(app, title, body);
    let app = app.clone();
    std::thread::spawn(move || {
        let Ok(handle) = notification.show() else {
            return;
        };
        let _ = handle.wait_for_response(|response: &NotificationResponse| {
            if matches!(
                response,
                NotificationResponse::Default | NotificationResponse::Action(_)
            ) {
                activate(&app, target);
            }
        });
    });
}

pub fn permission(app: &AppHandle) -> &'static str {
    match app.notification().permission_state() {
        Ok(PermissionState::Granted) => "granted",
        Ok(PermissionState::Denied) => "denied",
        _ => "unknown",
    }
}

pub fn request_permission(app: &AppHandle) -> &'static str {
    match app.notification().request_permission() {
        Ok(PermissionState::Granted) => "granted",
        Ok(PermissionState::Denied) => "denied",
        _ => "unknown",
    }
}
