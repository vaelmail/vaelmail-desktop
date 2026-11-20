use tauri::http::{header, Request, Response};
use tauri::{AppHandle, Manager};

use super::status;
use crate::commands::frame::take;
use crate::state::AppState;

pub fn serve(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let id = request.uri().path().trim_start_matches('/');
    let state = app.state::<AppState>();
    let Some(document) = take(&state, id) else {
        return status(404);
    };
    Response::builder()
        .status(200)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CONTENT_SECURITY_POLICY, document.csp)
        .header(header::REFERRER_POLICY, "no-referrer")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(document.html.into_bytes())
        .unwrap_or_default()
}
