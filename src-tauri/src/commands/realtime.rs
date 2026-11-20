use tauri::State;
use vael_client::realtime::Subscription;

use crate::state::AppState;

#[tauri::command]
pub fn realtime_subscribe(state: State<'_, AppState>, queries: Vec<Subscription>) {
    if let Some(realtime) = state.realtime() {
        realtime.subscribe(queries);
    }
}

#[tauri::command]
pub fn realtime_reconnect(state: State<'_, AppState>) {
    if let Some(realtime) = state.realtime() {
        realtime.reconnect();
    }
}
