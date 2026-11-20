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
                .clear_targets()
                .target(log_target())
                .build(),
        )
}

fn main_window(app: &tauri::App) -> tauri::Result<()> {
    let Some(config) = app.config().app.windows.first() else {
        return Ok(());
    };
    let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), config)?;
    if let Some(folder) = portable::folder("webview") {
        builder = builder.data_directory(folder);
    }
    builder.build()?;
    Ok(())
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
    main_window(app)?;

    drag::clear_staging();
    notify::init(app.handle());
    tray::build(app.handle())?;
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
        .setup(setup)
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
            desktop::mailto_take,
            updates::updates_supported,
            updates::updates_check,
            updates::updates_install,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build VaelMail");

    application.run(|app, event| {
        if let RunEvent::Exit = event {
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
