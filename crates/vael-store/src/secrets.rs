use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use keyring::Entry;
use rand::random;

use crate::error::{Result, StoreError};

pub const SERVICE: &str = "vaelmail-desktop";
const SESSION: &str = "session";
const PROBE: &str = "probe";
const CACHE_KEY: &str = "cache-key:";

static FILE: OnceLock<PathBuf> = OnceLock::new();
static FILE_LOCK: Mutex<()> = Mutex::new(());

pub fn use_file(path: PathBuf) {
    let _ = FILE.set(path);
}

pub fn file_backed() -> bool {
    FILE.get().is_some()
}

fn entry(name: &str) -> Result<Entry> {
    Entry::new(SERVICE, name).map_err(|_| StoreError::SecretsUnavailable)
}

fn read_file(path: &Path) -> BTreeMap<String, String> {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_file(path: &Path, values: &BTreeMap<String, String>) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let staging = path.with_extension("tmp");
    let bytes = serde_json::to_vec(values).map_err(|_| StoreError::SecretsUnavailable)?;
    std::fs::write(&staging, bytes)?;
    restrict(&staging);
    std::fs::rename(&staging, path)?;
    Ok(())
}

#[cfg(unix)]
fn restrict(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict(_path: &Path) {}

fn update_file(path: &Path, change: impl FnOnce(&mut BTreeMap<String, String>)) -> Result<()> {
    let _guard = FILE_LOCK.lock().unwrap();
    let mut values = read_file(path);
    change(&mut values);
    write_file(path, &values)
}

pub fn available() -> bool {
    if FILE.get().is_some() {
        return true;
    }
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        let Ok(probe) = entry(PROBE) else {
            return false;
        };
        let written = probe.set_password("ok").is_ok();
        let _ = probe.delete_credential();
        written
    })
}

pub fn get(name: &str) -> Option<String> {
    if let Some(path) = FILE.get() {
        let _guard = FILE_LOCK.lock().unwrap();
        return read_file(path).remove(name);
    }
    entry(name).ok()?.get_password().ok()
}

pub fn set(name: &str, value: &str) -> Result<()> {
    if let Some(path) = FILE.get() {
        return update_file(path, |values| {
            values.insert(name.to_owned(), value.to_owned());
        });
    }
    entry(name)?
        .set_password(value)
        .map_err(|_| StoreError::SecretsUnavailable)
}

pub fn delete(name: &str) {
    if let Some(path) = FILE.get() {
        let _ = update_file(path, |values| {
            values.remove(name);
        });
        return;
    }
    if let Ok(entry) = entry(name) {
        let _ = entry.delete_credential();
    }
}

pub fn purge(cache_directory: &Path) {
    clear_session_token();
    let Ok(listing) = std::fs::read_dir(cache_directory) else {
        return;
    };
    for item in listing.flatten() {
        let name = item.file_name();
        let Some(account) = name
            .to_str()
            .and_then(|name| name.strip_prefix("cache-"))
            .and_then(|name| name.strip_suffix(".db"))
        else {
            continue;
        };
        forget_cache_key(account);
    }
}

pub fn session_token() -> Option<String> {
    get(SESSION)
}

pub fn save_session_token(token: &str) -> Result<()> {
    set(SESSION, token)
}

pub fn clear_session_token() {
    delete(SESSION);
}

pub fn cache_key(account: &str) -> Result<[u8; 32]> {
    let name = format!("{CACHE_KEY}{account}");
    if let Some(stored) = get(&name) {
        if let Some(key) = decode(&stored) {
            return Ok(key);
        }
    }
    let key: [u8; 32] = random();
    set(&name, &encode(&key))?;
    Ok(key)
}

pub fn forget_cache_key(account: &str) {
    delete(&format!("{CACHE_KEY}{account}"));
}

pub fn encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode(text: &str) -> Option<[u8; 32]> {
    if text.len() != 64 {
        return None;
    }
    let mut key = [0u8; 32];
    for (index, slot) in key.iter_mut().enumerate() {
        *slot = u8::from_str_radix(&text[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_backend_round_trip_and_purge() {
        let directory =
            std::env::temp_dir().join(format!("vael-secrets-{}", rand::random::<u64>()));
        std::fs::create_dir_all(&directory).unwrap();
        use_file(directory.join("secrets.json"));
        assert!(file_backed());
        assert!(available());

        save_session_token("token").unwrap();
        assert_eq!(session_token().as_deref(), Some("token"));
        let key = cache_key("account").unwrap();
        assert_eq!(cache_key("account").unwrap(), key);

        std::fs::write(directory.join("cache-account.db"), b"").unwrap();
        purge(&directory);
        assert_eq!(session_token(), None);
        assert_eq!(get("cache-key:account"), None);
        let _ = std::fs::remove_dir_all(directory);
    }
}
