use std::path::PathBuf;

use futures_util::StreamExt;
use reqwest::Method;
use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Request as IpcRequest;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncWriteExt;
use vael_client::http::{Body, Upload};
use vael_client::{mailto, routes, ClientError, Request};

use crate::commands::api::note_failure;
use crate::deeplink;
use crate::events::{self, UPLOAD_PROGRESS};
use crate::state::AppState;

#[derive(Serialize)]
pub struct Saved {
    pub saved: bool,
}

const EXPORTS: [&str; 2] = ["/api/account/export", "/api/account/mail-export"];

pub(crate) fn downloadable(path: &str) -> bool {
    routes::binary_allowed(path) || EXPORTS.contains(&path)
}

fn choose_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.dialog()
        .file()
        .set_file_name(name)
        .blocking_save_file()
        .and_then(|path| path.into_path().ok())
}

fn io_failure() -> ClientError {
    ClientError::invalid("the file could not be saved")
}

pub(crate) async fn fetch_to(
    app: &AppHandle,
    state: &AppState,
    path: String,
    target: &std::path::Path,
) -> Result<(), ClientError> {
    let request = Request {
        accept: Some("*/*"),
        ..Request::get(path)
    };
    let response = state
        .client
        .stream(&request)
        .await
        .inspect_err(|error| note_failure(app, error))?;
    if !response.status().is_success() {
        return Err(ClientError::Status {
            status: response.status().as_u16(),
        });
    }
    let mut file = tokio::fs::File::create(target)
        .await
        .map_err(|_| io_failure())?;
    let mut chunks = response.bytes_stream();
    while let Some(chunk) = chunks.next().await {
        let chunk = chunk.map_err(|_| ClientError::Offline)?;
        file.write_all(&chunk).await.map_err(|_| io_failure())?;
    }
    file.flush().await.map_err(|_| io_failure())
}

#[tauri::command]
pub async fn download(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    suggested_name: String,
) -> Result<Saved, ClientError> {
    if !downloadable(&path) {
        return Err(ClientError::invalid("that download is not allowed"));
    }
    let Some(target) = choose_file(&app, &suggested_name) else {
        return Ok(Saved { saved: false });
    };
    fetch_to(&app, &state, path, &target).await?;
    Ok(Saved { saved: true })
}

#[tauri::command]
pub async fn save_text(
    app: AppHandle,
    suggested_name: String,
    contents: String,
) -> Result<Saved, ClientError> {
    let Some(target) = choose_file(&app, &suggested_name) else {
        return Ok(Saved { saved: false });
    };
    tokio::fs::write(target, contents)
        .await
        .map_err(|_| io_failure())?;
    Ok(Saved { saved: true })
}

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), ClientError> {
    let parsed =
        url::Url::parse(&url).map_err(|_| ClientError::invalid("that link is not valid"))?;
    match parsed.scheme() {
        "http" | "https" => app
            .opener()
            .open_url(parsed.as_str(), None::<&str>)
            .map_err(|_| ClientError::invalid("the link could not be opened")),
        "mailto" => {
            let message = mailto::parse(&url)
                .ok_or_else(|| ClientError::invalid("that link is not valid"))?;
            deeplink::queue(&app, message);
            Ok(())
        }
        _ => Err(ClientError::invalid("that link type is not supported")),
    }
}

fn header(request: &IpcRequest<'_>, name: &str) -> Result<String, ClientError> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| ClientError::invalid("the upload is incomplete"))
}

#[tauri::command]
pub async fn attachment_upload(
    app: AppHandle,
    state: State<'_, AppState>,
    request: IpcRequest<'_>,
) -> Result<Value, ClientError> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err(ClientError::invalid("the upload is incomplete"));
    };
    let id = header(&request, "x-upload-id")?;
    let generation: u64 = header(&request, "x-generation")?
        .parse()
        .map_err(|_| ClientError::invalid("the upload is incomplete"))?;
    let file_name = percent_encoding::percent_decode_str(&header(&request, "x-file-name")?)
        .decode_utf8_lossy()
        .into_owned();
    let progress_app = app.clone();
    let progress_id = id.clone();
    let upload = Upload {
        draft_id: header(&request, "x-draft-id")?,
        file_name,
        file_type: header(&request, "x-file-type")?,
        data: bytes::Bytes::copy_from_slice(data),
        progress: Some(std::sync::Arc::new(move |percent| {
            events::emit(
                &progress_app,
                UPLOAD_PROGRESS,
                serde_json::json!({ "id": progress_id, "percent": percent }),
            );
        })),
    };
    let mut call =
        Request::new(Method::POST, "/api/webmail/attachments").generation(Some(generation));
    call.body = Body::Upload(upload);

    let (handle, registration) = futures_util::future::AbortHandle::new_pair();
    state.inflight.lock().unwrap().insert(id.clone(), handle);
    let outcome =
        futures_util::future::Abortable::new(state.client.send(&call), registration).await;
    state.inflight.lock().unwrap().remove(&id);

    let response = outcome
        .map_err(|_| ClientError::Cancelled)?
        .inspect_err(|error| note_failure(&app, error))?;
    let value = response.value();
    if response.ok() {
        return Ok(value);
    }
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("the upload failed");
    Err(ClientError::invalid(message))
}

#[tauri::command]
pub fn upload_cancel(app: AppHandle, upload_id: String) {
    let state = app.state::<AppState>();
    let handle = state.inflight.lock().unwrap().remove(&upload_id);
    if let Some(handle) = handle {
        handle.abort();
    }
}
