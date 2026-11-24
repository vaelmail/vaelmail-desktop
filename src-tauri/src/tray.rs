use tauri::image::Image;
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::events::{self, TRAY_COMPOSE};
use crate::lifecycle;
use crate::notify;

const TRAY_ID: &str = "main";
const IDLE: &[u8] = include_bytes!("../icons/tray/idle.png");
const UNREAD: &[u8] = include_bytes!("../icons/tray/unread.png");
const OFFLINE: &[u8] = include_bytes!("../icons/tray/offline.png");

pub fn build(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let open = MenuItem::with_id(app, "open", "Open VaelMail", true, None::<&str>)?;
    let compose = MenuItem::with_id(app, "compose", "New message", true, None::<&str>)?;
    let check = MenuItem::with_id(app, "check", "Check mail", true, None::<&str>)?;
    let pause_hour = MenuItem::with_id(
        app,
        "pause-hour",
        "Pause notifications for 1 hour",
        true,
        None::<&str>,
    )?;
    let pause_day = MenuItem::with_id(
        app,
        "pause-day",
        "Pause notifications until tomorrow",
        true,
        None::<&str>,
    )?;
    let resume = MenuItem::with_id(app, "resume", "Resume notifications", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &compose,
            &check,
            &PredefinedMenuItem::separator(app)?,
            &pause_hour,
            &pause_day,
            &resume,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(IDLE)?)
        .tooltip("VaelMail")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                lifecycle::show_main(tray.app_handle());
            }
        })
        .build(app)
}

fn on_menu(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "open" => lifecycle::show_main(app),
        "compose" => {
            lifecycle::show_main(app);
            events::emit(app, TRAY_COMPOSE, ());
        }
        "check" => {
            let state = app.state::<crate::state::AppState>();
            if let Some(realtime) = state.realtime() {
                realtime.reconnect();
            }
        }
        "pause-hour" => notify::pause(app, Some(60)),
        "pause-day" => notify::pause(app, Some(60 * 24)),
        "resume" => notify::pause(app, None),
        "quit" => lifecycle::quit(app),
        _ => {}
    }
}

pub fn update(app: &AppHandle, unread: i64, offline: bool) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let bytes = if offline {
        OFFLINE
    } else if unread > 0 {
        UNREAD
    } else {
        IDLE
    };
    if let Ok(image) = Image::from_bytes(bytes) {
        let _ = tray.set_icon(Some(image));
    }
    let tooltip = if offline {
        "VaelMail — offline".to_owned()
    } else if unread > 0 {
        format!("VaelMail — {unread} unread")
    } else {
        "VaelMail".to_owned()
    };
    let _ = tray.set_tooltip(Some(tooltip));
}
