pub const ORIGIN: &str = "https://vaelmail.com";
pub const API_BASE: &str = "https://vaelmail.com/api";
pub const REALTIME_URL: &str = "wss://vaelmail.com/api/webmail/realtime";
pub const SESSION_COOKIE: &str = "__Host-vael-session";
pub const LOGIN_COOKIE: &str = "__Host-vael-login";
pub const GENERATION_HEADER: &str = "x-vael-generation";
pub const OPERATION_HEADER: &str = "x-vael-operation";
pub const SOCKET_BODY_LIMIT: usize = 240_000;
pub const SOCKET_FRAME_LIMIT: usize = 8 * 1024 * 1024;
pub const RPC_TIMEOUT_SECS: u64 = 35;
pub const HEARTBEAT_WATCHDOG_SECS: u64 = 60;

pub fn user_agent(version: &str) -> String {
    let platform = if cfg!(target_os = "windows") {
        "Windows NT 10.0; Win64; x64"
    } else if cfg!(target_os = "macos") {
        "Macintosh; Mac OS X 15_0"
    } else {
        "X11; Linux x86_64"
    };
    format!("VaelMail-Desktop/{version} ({platform})")
}
