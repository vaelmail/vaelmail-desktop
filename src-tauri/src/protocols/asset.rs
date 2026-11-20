use tauri::http::{header, Request, Response};
use tauri::{AppHandle, Manager};
use vael_client::{routes, Request as Outgoing};

use super::status;
use crate::state::AppState;

const ALLOWED_TYPES: [&str; 6] = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
];

pub async fn serve(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != "GET" {
        return status(405);
    }
    let Some(target) = request.uri().path_and_query() else {
        return status(400);
    };
    let path = target.as_str();
    if !routes::binary_allowed(path) {
        return status(403);
    }
    let state = app.state::<AppState>();
    let outgoing = Outgoing {
        accept: Some("image/*"),
        ..Outgoing::get(path)
    };
    let Ok(response) = state.client.send(&outgoing).await else {
        return status(502);
    };
    if !response.ok() {
        return status(response.status);
    }
    let kind = response
        .headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| {
            value
                .split(';')
                .next()
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase()
        })
        .unwrap_or_default();
    if !ALLOWED_TYPES.contains(&kind.as_str()) {
        return status(415);
    }
    Response::builder()
        .status(200)
        .header(header::CONTENT_TYPE, kind)
        .header(header::CACHE_CONTROL, "private, max-age=300")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; sandbox",
        )
        .body(response.body.to_vec())
        .unwrap_or_default()
}
