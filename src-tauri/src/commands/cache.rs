use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use vael_client::ClientError;
use vael_store::cache::account_hash;
use vael_store::{Cache, CacheEntry, RecoveryRecord};

use crate::commands::session::last_account_path;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hydrated {
    pub saved_at: Option<i64>,
    pub entries: Vec<CacheEntry>,
}

#[derive(Deserialize)]
pub struct Write {
    pub key: String,
    pub value: Value,
}

fn failure() -> ClientError {
    ClientError::invalid("the local cache is unavailable")
}

fn ensure_open(state: &AppState) {
    let mut guard = state.cache.lock().unwrap();
    if guard.is_some() || !state.settings().cache.enabled || !vael_store::secrets::available() {
        return;
    }
    let Ok(account) = std::fs::read_to_string(last_account_path(state)) else {
        return;
    };
    if let Ok(cache) = Cache::open(&state.data_dir, account.trim()) {
        *guard = Some(cache);
    }
}

#[tauri::command]
pub fn cache_open(state: State<'_, AppState>, mailbox_id: String, encrypted: bool) -> bool {
    let settings = state.settings();
    if !settings.cache.enabled || (encrypted && !settings.cache.encrypted_mailboxes) {
        return false;
    }
    if !vael_store::secrets::available() {
        return false;
    }
    let account = account_hash(&mailbox_id);
    let mut guard = state.cache.lock().unwrap();
    if guard
        .as_ref()
        .is_some_and(|cache| cache.account() == account)
    {
        return true;
    }
    match Cache::open(&state.data_dir, &account) {
        Ok(cache) => {
            let _ = std::fs::write(last_account_path(&state), &account);
            *guard = Some(cache);
            true
        }
        Err(_) => false,
    }
}

#[tauri::command]
pub fn cache_hydrate(state: State<'_, AppState>) -> Hydrated {
    ensure_open(&state);
    let guard = state.cache.lock().unwrap();
    let entries = guard
        .as_ref()
        .and_then(|cache| cache.hydrate().ok())
        .unwrap_or_default();
    let saved_at = entries.iter().map(|entry| entry.updated_at).max();
    Hydrated { saved_at, entries }
}

#[tauri::command]
pub fn cache_write(state: State<'_, AppState>, entries: Vec<Write>) -> Result<(), ClientError> {
    let guard = state.cache.lock().unwrap();
    let Some(cache) = guard.as_ref() else {
        return Ok(());
    };
    let pairs: Vec<(String, Value)> = entries
        .into_iter()
        .map(|entry| (entry.key, entry.value))
        .collect();
    let limit = state.settings().cache.max_threads as usize;
    cache.write(&pairs, limit).map_err(|_| failure())
}

#[tauri::command]
pub fn cache_remove(state: State<'_, AppState>, keys: Vec<String>) -> Result<(), ClientError> {
    let guard = state.cache.lock().unwrap();
    match guard.as_ref() {
        Some(cache) => cache.remove(&keys).map_err(|_| failure()),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn cache_remove_prefix(state: State<'_, AppState>, prefix: String) -> Result<(), ClientError> {
    let guard = state.cache.lock().unwrap();
    match guard.as_ref() {
        Some(cache) => cache.remove_prefix(&prefix).map_err(|_| failure()),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn cache_clear(state: State<'_, AppState>) -> Result<(), ClientError> {
    let guard = state.cache.lock().unwrap();
    match guard.as_ref() {
        Some(cache) => cache.clear().map_err(|_| failure()),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn cache_size(state: State<'_, AppState>) -> u64 {
    state.cache.lock().unwrap().as_ref().map_or(0, Cache::size)
}

#[tauri::command]
pub fn recovery_put(state: State<'_, AppState>, record: RecoveryRecord) -> Result<(), ClientError> {
    let guard = state.cache.lock().unwrap();
    if let Some(cache) = guard.as_ref() {
        return cache.put_recovery(&record).map_err(|_| failure());
    }
    let mut memory = state.memory_recovery.lock().unwrap();
    memory.retain(|existing| existing.key != record.key);
    memory.push(record);
    Ok(())
}

#[tauri::command]
pub fn recovery_list(state: State<'_, AppState>, mailbox_id: String) -> Vec<RecoveryRecord> {
    let guard = state.cache.lock().unwrap();
    if let Some(cache) = guard.as_ref() {
        return cache.list_recovery(&mailbox_id).unwrap_or_default();
    }
    state
        .memory_recovery
        .lock()
        .unwrap()
        .iter()
        .filter(|record| record.mailbox_id == mailbox_id)
        .cloned()
        .collect()
}

#[tauri::command]
pub fn recovery_remove(state: State<'_, AppState>, key: String) -> Result<(), ClientError> {
    state
        .memory_recovery
        .lock()
        .unwrap()
        .retain(|record| record.key != key);
    let guard = state.cache.lock().unwrap();
    match guard.as_ref() {
        Some(cache) => cache.remove_recovery(&key).map_err(|_| failure()),
        None => Ok(()),
    }
}

#[tauri::command]
pub fn recovery_clear(state: State<'_, AppState>) -> Result<(), ClientError> {
    state.memory_recovery.lock().unwrap().clear();
    let guard = state.cache.lock().unwrap();
    match guard.as_ref() {
        Some(cache) => cache.clear_recovery().map_err(|_| failure()),
        None => Ok(()),
    }
}
