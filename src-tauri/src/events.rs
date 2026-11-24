use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const REALTIME_STATUS: &str = "realtime:status";
pub const REALTIME_SNAPSHOT: &str = "realtime:snapshot";
pub const REALTIME_REFRESH: &str = "realtime:refresh";
pub const SESSION_ENDED: &str = "session:ended";
pub const CHALLENGE_REQUIRED: &str = "challenge:required";
pub const VERIFICATION: &str = "verification:state";
pub const NOTIFICATION_ACTIVATED: &str = "notification:activated";
pub const MAILTO_PENDING: &str = "mailto:pending";
pub const NETWORK_ONLINE: &str = "network:online";
pub const UPDATES_AVAILABLE: &str = "updates:available";
pub const UPDATES_PROGRESS: &str = "updates:progress";
pub const UPLOAD_PROGRESS: &str = "upload:progress";
pub const TRAY_COMPOSE: &str = "tray:compose";
pub const OPEN_INBOX: &str = "shell:inbox";
pub const MAIL_ARRIVED: &str = "mail:arrived";

pub fn emit<S: Serialize + Clone>(app: &AppHandle, name: &str, payload: S) {
    let _ = app.emit(name, payload);
}
