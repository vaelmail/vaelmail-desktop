pub mod asset;
pub mod frame;

use tauri::http::{header, Response};

pub fn status(code: u16) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header(header::CACHE_CONTROL, "no-store")
        .body(Vec::new())
        .unwrap_or_default()
}
