use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

use futures_util::future::AbortHandle;
use vael_client::arrivals::{Arrivals, Service};
use vael_client::realtime::Realtime;
use vael_client::Client;
use vael_store::{Cache, DesktopSettings, RecoveryRecord, SettingsFile};

pub struct FrameDocument {
    pub html: String,
    pub csp: String,
    pub created: Instant,
}

pub struct AppState {
    pub client: Arc<Client>,
    pub settings: RwLock<DesktopSettings>,
    pub settings_file: SettingsFile,
    pub data_dir: PathBuf,
    pub cache: Mutex<Option<Cache>>,
    pub memory_recovery: Mutex<Vec<RecoveryRecord>>,
    pub realtime: Mutex<Option<Arc<Realtime>>>,
    pub inflight: Mutex<HashMap<String, AbortHandle>>,
    pub frames: Mutex<HashMap<String, FrameDocument>>,
    pub arrivals: Mutex<Arrivals>,
    pub services: Mutex<Vec<Service>>,
    pub unread: AtomicI64,
    pub server_notifications: AtomicBool,
    pub paused_until: Mutex<Option<Instant>>,
    pub online: AtomicBool,
    pub pending_mailto: Mutex<Vec<vael_client::mailto::Mailto>>,
    pub update: Mutex<Option<tauri_plugin_updater::Update>>,
    pub handoff: Mutex<Option<String>>,
    pub action_handoff: Mutex<Option<String>>,
    pub staged: Mutex<HashMap<String, PathBuf>>,
}

impl AppState {
    pub fn new(
        client: Arc<Client>,
        settings: DesktopSettings,
        settings_file: SettingsFile,
        data_dir: PathBuf,
    ) -> Self {
        Self {
            client,
            settings: RwLock::new(settings),
            settings_file,
            data_dir,
            cache: Mutex::new(None),
            memory_recovery: Mutex::new(Vec::new()),
            realtime: Mutex::new(None),
            inflight: Mutex::new(HashMap::new()),
            frames: Mutex::new(HashMap::new()),
            arrivals: Mutex::new(Arrivals::default()),
            services: Mutex::new(Vec::new()),
            unread: AtomicI64::new(0),
            server_notifications: AtomicBool::new(false),
            paused_until: Mutex::new(None),
            online: AtomicBool::new(true),
            pending_mailto: Mutex::new(Vec::new()),
            update: Mutex::new(None),
            handoff: Mutex::new(None),
            action_handoff: Mutex::new(None),
            staged: Mutex::new(HashMap::new()),
        }
    }

    pub fn realtime(&self) -> Option<Arc<Realtime>> {
        self.realtime.lock().unwrap().clone()
    }

    pub fn settings(&self) -> DesktopSettings {
        self.settings.read().unwrap().clone()
    }
}
