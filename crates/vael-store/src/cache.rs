use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::error::Result;
use crate::secrets;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub key: String,
    pub value: Value,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryRecord {
    pub key: String,
    pub mailbox_id: String,
    pub generation: i64,
    pub draft: Value,
    pub saved_at: i64,
}

pub struct Cache {
    connection: Mutex<Connection>,
    path: PathBuf,
    account: String,
}

pub fn account_hash(mailbox_id: &str) -> String {
    secrets::encode(&Sha256::digest(mailbox_id.as_bytes()))[..32].to_owned()
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

fn escape_like(prefix: &str) -> String {
    prefix
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

impl Cache {
    pub fn open(directory: &Path, account: &str) -> Result<Self> {
        let key = secrets::cache_key(account)?;
        Self::open_with_key(directory, account, &key)
    }

    pub fn open_with_key(directory: &Path, account: &str, key: &[u8; 32]) -> Result<Self> {
        std::fs::create_dir_all(directory)?;
        let path = directory.join(format!("cache-{account}.db"));
        let connection = Connection::open(&path)?;
        connection.execute_batch(&format!("PRAGMA key = \"x'{}'\";", secrets::encode(key)))?;
        connection.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA secure_delete = ON;
             CREATE TABLE IF NOT EXISTS entries (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS recovery (
                 key TEXT PRIMARY KEY,
                 mailbox_id TEXT NOT NULL,
                 generation INTEGER NOT NULL,
                 draft TEXT NOT NULL,
                 saved_at INTEGER NOT NULL
             );",
        )?;
        Ok(Self {
            connection: Mutex::new(connection),
            path,
            account: account.to_owned(),
        })
    }

    pub fn account(&self) -> &str {
        &self.account
    }

    pub fn hydrate(&self) -> Result<Vec<CacheEntry>> {
        let connection = self.connection.lock().unwrap();
        let mut statement = connection.prepare("SELECT key, value, updated_at FROM entries")?;
        let rows = statement.query_map([], |row| {
            let text: String = row.get(1)?;
            Ok(CacheEntry {
                key: row.get(0)?,
                value: serde_json::from_str(&text).unwrap_or(Value::Null),
                updated_at: row.get(2)?,
            })
        })?;
        Ok(rows.filter_map(|row| row.ok()).collect())
    }

    pub fn write(&self, entries: &[(String, Value)], limit: usize) -> Result<()> {
        let mut connection = self.connection.lock().unwrap();
        let transaction = connection.transaction()?;
        {
            let mut statement = transaction.prepare(
                "INSERT INTO entries (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            )?;
            let stamp = now();
            for (key, value) in entries {
                statement.execute(params![key, value.to_string(), stamp])?;
            }
        }
        transaction.execute(
            "DELETE FROM entries WHERE key LIKE 'thread:%' AND key NOT IN (
                 SELECT key FROM entries WHERE key LIKE 'thread:%' ORDER BY updated_at DESC LIMIT ?1
             )",
            params![limit as i64],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn remove(&self, keys: &[String]) -> Result<()> {
        let connection = self.connection.lock().unwrap();
        for key in keys {
            connection.execute("DELETE FROM entries WHERE key = ?1", params![key])?;
        }
        Ok(())
    }

    pub fn remove_prefix(&self, prefix: &str) -> Result<()> {
        let connection = self.connection.lock().unwrap();
        connection.execute(
            "DELETE FROM entries WHERE key LIKE ?1 ESCAPE '\\'",
            params![format!("{}%", escape_like(prefix))],
        )?;
        Ok(())
    }

    pub fn clear(&self) -> Result<()> {
        let connection = self.connection.lock().unwrap();
        connection.execute("DELETE FROM entries", [])?;
        Ok(())
    }

    pub fn size(&self) -> u64 {
        ["", "-wal", "-shm"]
            .iter()
            .filter_map(|suffix| {
                let mut name = self.path.clone().into_os_string();
                name.push(suffix);
                std::fs::metadata(name).ok()
            })
            .map(|meta| meta.len())
            .sum()
    }

    pub fn put_recovery(&self, record: &RecoveryRecord) -> Result<()> {
        let connection = self.connection.lock().unwrap();
        connection.execute(
            "INSERT INTO recovery (key, mailbox_id, generation, draft, saved_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(key) DO UPDATE SET draft = excluded.draft, saved_at = excluded.saved_at,
                 generation = excluded.generation, mailbox_id = excluded.mailbox_id",
            params![
                record.key,
                record.mailbox_id,
                record.generation,
                record.draft.to_string(),
                record.saved_at
            ],
        )?;
        Ok(())
    }

    pub fn list_recovery(&self, mailbox_id: &str) -> Result<Vec<RecoveryRecord>> {
        let connection = self.connection.lock().unwrap();
        let mut statement = connection.prepare(
            "SELECT key, mailbox_id, generation, draft, saved_at FROM recovery WHERE mailbox_id = ?1",
        )?;
        let rows = statement.query_map(params![mailbox_id], |row| {
            let text: String = row.get(3)?;
            Ok(RecoveryRecord {
                key: row.get(0)?,
                mailbox_id: row.get(1)?,
                generation: row.get(2)?,
                draft: serde_json::from_str(&text).unwrap_or(Value::Null),
                saved_at: row.get(4)?,
            })
        })?;
        Ok(rows.filter_map(|row| row.ok()).collect())
    }

    pub fn remove_recovery(&self, key: &str) -> Result<()> {
        let connection = self.connection.lock().unwrap();
        connection.execute("DELETE FROM recovery WHERE key = ?1", params![key])?;
        Ok(())
    }

    pub fn clear_recovery(&self) -> Result<()> {
        let connection = self.connection.lock().unwrap();
        connection.execute("DELETE FROM recovery", [])?;
        Ok(())
    }

    pub fn destroy(self) {
        let path = self.path.clone();
        let account = self.account.clone();
        drop(self);
        for suffix in ["", "-wal", "-shm"] {
            let mut name = path.clone().into_os_string();
            name.push(suffix);
            let _ = std::fs::remove_file(name);
        }
        secrets::forget_cache_key(&account);
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn directory() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("vael-cache-{}", rand::random::<u64>()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn round_trips_entries() {
        let dir = directory();
        let cache = Cache::open_with_key(&dir, "acct", &[7; 32]).unwrap();
        cache
            .write(&[("bootstrap".into(), json!({ "a": 1 }))], 10)
            .unwrap();
        let entries = cache.hydrate().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].value, json!({ "a": 1 }));
        drop(cache);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn file_is_unreadable_with_another_key() {
        let dir = directory();
        drop(Cache::open_with_key(&dir, "acct", &[1; 32]).unwrap());
        assert!(Cache::open_with_key(&dir, "acct", &[2; 32]).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keeps_only_the_newest_threads() {
        let dir = directory();
        let cache = Cache::open_with_key(&dir, "acct", &[3; 32]).unwrap();
        for index in 0..5 {
            cache
                .write(&[(format!("thread:{index}"), json!(index))], 2)
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(3));
        }
        let threads = cache
            .hydrate()
            .unwrap()
            .into_iter()
            .filter(|entry| entry.key.starts_with("thread:"))
            .count();
        assert_eq!(threads, 2);
        drop(cache);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn removes_by_prefix_and_keeps_the_rest() {
        let dir = directory();
        let cache = Cache::open_with_key(&dir, "acct", &[4; 32]).unwrap();
        cache
            .write(
                &[
                    ("mail:1".into(), json!(1)),
                    ("mail:2".into(), json!(2)),
                    ("bootstrap".into(), json!(3)),
                ],
                10,
            )
            .unwrap();
        cache.remove_prefix("mail:").unwrap();
        let keys: Vec<_> = cache
            .hydrate()
            .unwrap()
            .into_iter()
            .map(|e| e.key)
            .collect();
        assert_eq!(keys, vec!["bootstrap".to_owned()]);
        drop(cache);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn recovery_records_are_scoped_to_a_mailbox() {
        let dir = directory();
        let cache = Cache::open_with_key(&dir, "acct", &[5; 32]).unwrap();
        let record = |key: &str, mailbox: &str| RecoveryRecord {
            key: key.into(),
            mailbox_id: mailbox.into(),
            generation: 1,
            draft: json!({}),
            saved_at: 1,
        };
        cache.put_recovery(&record("a", "m1")).unwrap();
        cache.put_recovery(&record("b", "m2")).unwrap();
        assert_eq!(cache.list_recovery("m1").unwrap().len(), 1);
        cache.clear_recovery().unwrap();
        assert!(cache.list_recovery("m2").unwrap().is_empty());
        drop(cache);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn account_hashes_are_stable_and_opaque() {
        assert_eq!(account_hash("mailbox"), account_hash("mailbox"));
        assert_ne!(account_hash("mailbox"), account_hash("other"));
        assert!(!account_hash("mailbox").contains("mailbox"));
    }
}
