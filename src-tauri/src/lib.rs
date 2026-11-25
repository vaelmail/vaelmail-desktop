mod badge;
mod commands;
mod deeplink;
mod events;
mod jumplist;
mod lifecycle;
mod mail_handler;
mod mailbox;
mod notify;
mod portable;
mod protocols;
mod state;
mod tray;
mod verification;

use std::sync::Arc;

use tauri::{Manager, RunEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_window_state::StateFlags;
use vael_client::Client;
use vael_store::SettingsFile;

use commands::{api, cache, desktop, drag, files, frame, realtime, session, updates};
use state::AppState;

const PURGE_FLAG: &str = "--purge-secrets";

fn log_target() -> tauri_plugin_log::Target {
    let kind = match portable::folder("logs") {
        Some(path) => tauri_plugin_log::TargetKind::Folder {
            path,
            file_name: None,
        },
        None => tauri_plugin_log::TargetKind::LogDir { file_name: None },
    };
    tauri_plugin_log::Target::new(kind)
}

fn plugins(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    let builder = if portable::active() {
        builder
    } else {
        builder.plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
    };
    builder
        .plugin(tauri_plugin_single_instance::init(|app, arguments, _| {
            deeplink::flags(app, &arguments);
            deeplink::handle(app, arguments);
            lifecycle::show_main(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(updates::UPDATER_KEY.unwrap_or("unset"))
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Warn)
                .level_for("vaelmail_desktop_lib", log::LevelFilter::Info)
                .level_for("vael_client", log::LevelFilter::Info)
                .max_file_size(2_000_000)
                .clear_targets()
                .target(log_target())
                .build(),
        )
}

fn main_window(app: &tauri::App) -> tauri::Result<()> {
    let mut last = None;
    for attempt in 0..3 {
        match lifecycle::create_main(app.handle()) {
            Ok(_) => return Ok(()),
            Err(error) => {
                log::error!("the main window could not be created (attempt {attempt}): {error}");
                last = Some(error);
                std::thread::sleep(std::time::Duration::from_millis(700));
            }
        }
    }
    Err(last.unwrap_or(tauri::Error::WindowNotFound))
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let (data_dir, config_dir) = match portable::root() {
        Some(root) => (root.join("data"), root.join("config")),
        None => (app.path().app_data_dir()?, app.path().app_config_dir()?),
    };
    std::fs::create_dir_all(&data_dir)?;
    let settings_file = SettingsFile::new(&config_dir);
    let mut settings = settings_file.load();
    settings.autostart =
        !portable::active() && app.autolaunch().is_enabled().unwrap_or(settings.autostart);
    let version = app.package_info().version.to_string();
    let client = Arc::new(Client::new(&version, &settings.proxy)?);
    app.manage(AppState::new(client, settings, settings_file, data_dir));
    log::info!("starting VaelMail {version}");
    verification::install(app.handle());
    main_window(app)?;
    lifecycle::show_soon(app.handle());

    drag::clear_staging();
    notify::init(app.handle());
    if let Err(error) = tray::build(app.handle()) {
        log::warn!("the tray icon is unavailable: {error}");
    }
    updates::spawn_auto_check(app.handle().clone());

    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        deeplink::handle(&handle, event.urls().iter().map(|url| url.to_string()));
    });
    jumplist::install(app.handle());
    deeplink::flags(app.handle(), std::env::args().skip(1));
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        deeplink::handle(app.handle(), urls.iter().map(|url| url.to_string()));
    }
    Ok(())
}

fn purge(arguments: &[String]) {
    let directory = arguments
        .iter()
        .position(|argument| argument == PURGE_FLAG)
        .and_then(|index| arguments.get(index + 1));
    if let Some(directory) = directory {
        vael_store::secrets::purge(std::path::Path::new(directory));
    }
}

pub fn run() {
    lifecycle::install_panic_log();
    let arguments: Vec<String> = std::env::args().collect();
    if arguments.iter().any(|argument| argument == PURGE_FLAG) {
        purge(&arguments);
        return;
    }
    if let Some(root) = portable::root() {
        vael_store::secrets::use_file(root.join("secrets.json"));
    }
    let application = plugins(tauri::Builder::default())
        .register_asynchronous_uri_scheme_protocol("vaelframe", |context, request, responder| {
            responder.respond(protocols::frame::serve(context.app_handle(), &request));
        })
        .register_asynchronous_uri_scheme_protocol("vaelapi", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                responder.respond(protocols::asset::serve(&app, &request).await);
            });
        })
        .setup(|app| setup(app).inspect_err(|error| log::error!("startup failed: {error}")))
        .on_window_event(lifecycle::on_window_event)
        .invoke_handler(tauri::generate_handler![
            session::session_status,
            session::session_start,
            session::session_finish,
            session::session_passkey_start,
            session::session_passkey_poll,
            session::session_passkey_cancel,
            session::session_action_passkey_start,
            session::session_action_passkey_poll,
            session::session_action_passkey_cancel,
            session::session_end,
            api::api_request,
            api::api_cancel,
            api::api_bytes,
            api::api_text,
            api::api_data_url,
            api::api_image,
            files::download,
            files::save_text,
            files::open_external,
            files::attachment_upload,
            files::upload_cancel,
            drag::attachment_stage,
            drag::attachment_drag,
            realtime::realtime_subscribe,
            realtime::realtime_reconnect,
            cache::cache_open,
            cache::cache_hydrate,
            cache::cache_write,
            cache::cache_remove,
            cache::cache_remove_prefix,
            cache::cache_clear,
            cache::cache_size,
            cache::recovery_put,
            cache::recovery_list,
            cache::recovery_remove,
            cache::recovery_clear,
            frame::frame_publish,
            frame::frame_release,
            desktop::desktop_settings_get,
            desktop::desktop_settings_set,
            desktop::app_info,
            desktop::notification_permission,
            desktop::notification_request,
            desktop::notification_test,
            desktop::notification_pause,
            desktop::focus_main,
            desktop::mail_handler_register,
            desktop::connection_test,
            desktop::frontend_ready,
            desktop::frontend_error,
            desktop::mailto_take,
            updates::updates_supported,
            updates::updates_check,
            updates::updates_install,
            verification::verification_reply,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build VaelMail");

    application.run(|app, event| {
        if let RunEvent::Exit = event {
            log::info!("exiting");
            drag::clear_staging();
        }
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            lifecycle::show_main(app);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = app;
    });
}
