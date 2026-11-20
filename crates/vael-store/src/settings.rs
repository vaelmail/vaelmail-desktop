use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use vael_client::ProxySettings;

use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    pub enabled: bool,
    pub show_sender: bool,
    pub sound: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateSettings {
    pub auto: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CacheSettings {
    pub enabled: bool,
    pub encrypted_mailboxes: bool,
    pub max_threads: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopSettings {
    pub close_to_tray: bool,
    pub start_hidden: bool,
    pub autostart: bool,
    pub tray_unread_dot: bool,
    pub notifications: NotificationSettings,
    pub updates: UpdateSettings,
    pub cache: CacheSettings,
    pub proxy: ProxySettings,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            show_sender: false,
            sound: true,
        }
    }
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self { auto: true }
    }
}

impl Default for CacheSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            encrypted_mailboxes: false,
            max_threads: 200,
        }
    }
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            start_hidden: false,
            autostart: false,
            tray_unread_dot: true,
            notifications: NotificationSettings::default(),
            updates: UpdateSettings::default(),
            cache: CacheSettings::default(),
            proxy: ProxySettings::default(),
        }
    }
}

pub struct SettingsFile {
    path: PathBuf,
}

impl SettingsFile {
    pub fn new(directory: &Path) -> Self {
        Self {
            path: directory.join("desktop-settings.json"),
        }
    }

    pub fn load(&self) -> DesktopSettings {
        std::fs::read(&self.path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, settings: &DesktopSettings) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.path, serde_json::to_vec_pretty(settings)?)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_protect_privacy() {
        let settings = DesktopSettings::default();
        assert!(!settings.notifications.show_sender);
        assert!(!settings.cache.encrypted_mailboxes);
        assert!(settings.close_to_tray);
    }

    #[test]
    fn saved_settings_round_trip_and_tolerate_missing_fields() {
        let dir = std::env::temp_dir().join(format!("vael-settings-{}", rand::random::<u64>()));
        let file = SettingsFile::new(&dir);
        let settings = DesktopSettings {
            autostart: true,
            ..DesktopSettings::default()
        };
        file.save(&settings).unwrap();
        assert!(file.load().autostart);
        std::fs::write(dir.join("desktop-settings.json"), r#"{"autostart":true}"#).unwrap();
        let loaded = file.load();
        assert!(loaded.autostart && loaded.close_to_tray);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
