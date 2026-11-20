use std::path::{Path, PathBuf};
use std::sync::mpsc;

use tauri::{AppHandle, State, Window};
use vael_client::ClientError;

use crate::commands::files::{downloadable, fetch_to};
use crate::state::AppState;

const ICON: &[u8] = include_bytes!("../../icons/64x64.png");

pub fn staging_root() -> PathBuf {
    std::env::temp_dir().join("VaelMail-drag")
}

pub fn clear_staging() {
    let _ = std::fs::remove_dir_all(staging_root());
}

fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "attachment".to_owned()
    } else {
        trimmed.chars().take(180).collect()
    }
}

async fn stage(
    app: &AppHandle,
    state: &AppState,
    path: &str,
    name: &str,
) -> Result<PathBuf, ClientError> {
    if !downloadable(path) {
        return Err(ClientError::invalid("that attachment cannot be dragged"));
    }
    if let Some(existing) = state.staged.lock().unwrap().get(path) {
        if existing.is_file() {
            return Ok(existing.clone());
        }
    }
    let folder = staging_root().join(uuid::Uuid::new_v4().to_string());
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|_| ClientError::invalid("the attachment could not be prepared"))?;
    let target = folder.join(safe_name(name));
    if let Err(error) = fetch_to(app, state, path.to_owned(), &target).await {
        let _ = tokio::fs::remove_dir_all(&folder).await;
        return Err(error);
    }
    state
        .staged
        .lock()
        .unwrap()
        .insert(path.to_owned(), target.clone());
    Ok(target)
}

#[tauri::command]
pub async fn attachment_stage(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<(), ClientError> {
    stage(&app, &state, &path, &name).await.map(|_| ())
}

fn start(window: &Window, file: &Path) -> Result<(), drag::Error> {
    #[cfg(target_os = "linux")]
    let handle = window
        .gtk_window()
        .map_err(|_| drag::Error::FailedToStartDrag)?;
    #[cfg(not(target_os = "linux"))]
    let handle = window.clone();
    drag::start_drag(
        &handle,
        drag::DragItem::Files(vec![file.to_path_buf()]),
        drag::Image::Raw(ICON.to_vec()),
        |_, _| {},
        drag::Options::default(),
    )
}

#[tauri::command]
pub async fn attachment_drag(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<bool, ClientError> {
    let file = stage(&app, &state, &path, &name).await?;
    let (sender, receiver) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(start(&window, &file).is_ok());
    })
    .map_err(|_| ClientError::invalid("the drag could not start"))?;
    Ok(receiver.recv().unwrap_or(false))
}
