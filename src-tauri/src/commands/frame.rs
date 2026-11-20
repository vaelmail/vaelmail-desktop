use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

use crate::state::{AppState, FrameDocument};

const LIFETIME: Duration = Duration::from_secs(60);
const MAX_SIZE: usize = 8 * 1024 * 1024;

#[derive(Serialize)]
pub struct Published {
    pub id: String,
}

#[tauri::command]
pub fn frame_publish(
    state: State<'_, AppState>,
    html: String,
    csp: String,
) -> Result<Published, String> {
    if html.len() > MAX_SIZE {
        return Err("that message is too large to display".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let mut frames = state.frames.lock().unwrap();
    frames.retain(|_, frame| frame.created.elapsed() < LIFETIME);
    frames.insert(
        id.clone(),
        FrameDocument {
            html,
            csp,
            created: Instant::now(),
        },
    );
    Ok(Published { id })
}

#[tauri::command]
pub fn frame_release(state: State<'_, AppState>, id: String) {
    state.frames.lock().unwrap().remove(&id);
}

pub fn take(state: &AppState, id: &str) -> Option<FrameDocument> {
    let frame = state.frames.lock().unwrap().remove(id)?;
    (frame.created.elapsed() < LIFETIME).then_some(frame)
}
