use futures_util::future::{AbortHandle, Abortable};
use reqwest::Method;
use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Response as IpcResponse;
use tauri::{AppHandle, State};
use vael_client::realtime::{Realtime, SocketCall};
use vael_client::{routes, Client, ClientError, Request};

use crate::commands::session::end_local;
use crate::events::{self, CHALLENGE_REQUIRED};
use crate::mailbox;
use crate::state::AppState;

#[derive(Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub value: Value,
}

fn valid_path(path: &str) -> Result<(), ClientError> {
    if path.starts_with("/api/") && !path.contains("..") && path.len() <= 8192 {
        Ok(())
    } else {
        Err(ClientError::invalid("that request is not allowed"))
    }
}

pub fn note_failure(app: &AppHandle, error: &ClientError) {
    match error {
        ClientError::Offline => mailbox::note_network(app, false),
        ClientError::Challenge { retry_after } => {
            events::emit(
                app,
                CHALLENGE_REQUIRED,
                serde_json::json!({ "retryAfter": retry_after }),
            );
        }
        _ => {}
    }
}

fn after_response(app: &AppHandle, path: &str, status: u16, value: &Value) {
    if status == 401 && !path.starts_with("/api/session") {
        end_local(app, "expired");
        return;
    }
    if status == 200 && path.starts_with("/api/webmail/bootstrap") {
        mailbox::observe(app, value, None);
    }
}

struct Call {
    request_id: String,
    path: String,
    method: String,
    body: Option<Value>,
    generation: Option<u64>,
}

async fn dispatch(
    app: &AppHandle,
    client: &Client,
    realtime: Option<std::sync::Arc<Realtime>>,
    call: Call,
) -> Result<ApiResponse, ClientError> {
    let Call {
        request_id,
        path,
        method,
        body,
        generation,
    } = call;
    if let Some(realtime) = realtime {
        if Realtime::eligible(&path, &method, body.as_ref()) {
            let socket = SocketCall {
                id: request_id.clone(),
                path: path.clone(),
                method: method.clone(),
                body: body.clone(),
                generation,
            };
            if let Some(response) = realtime.call(socket).await {
                if !(method == "GET" && response.status == 413) {
                    after_response(app, &path, response.status, &response.value);
                    return Ok(ApiResponse {
                        status: response.status,
                        value: response.value,
                    });
                }
            }
        }
    }

    let verb = Method::from_bytes(method.as_bytes())
        .map_err(|_| ClientError::invalid("unsupported method"))?;
    let mut request = Request::new(verb, path.clone()).generation(generation);
    if let Some(body) = body {
        request = request.json(body);
    }
    if method != "GET" && path.starts_with("/api/webmail/") {
        request = request.operation(Some(request_id));
    }
    let response = client
        .send(&request)
        .await
        .inspect_err(|error| note_failure(app, error))?;
    let value = response.value();
    after_response(app, &path, response.status, &value);
    Ok(ApiResponse {
        status: response.status,
        value,
    })
}

#[tauri::command]
pub async fn api_request(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: String,
    path: String,
    method: String,
    body: Option<Value>,
    generation: Option<u64>,
) -> Result<ApiResponse, ClientError> {
    valid_path(&path)?;
    let (handle, registration) = AbortHandle::new_pair();
    state
        .inflight
        .lock()
        .unwrap()
        .insert(request_id.clone(), handle);
    let call = Call {
        request_id: request_id.clone(),
        path,
        method,
        body,
        generation,
    };
    let work = dispatch(&app, &state.client, state.realtime(), call);
    let outcome = Abortable::new(work, registration).await;
    state.inflight.lock().unwrap().remove(&request_id);
    outcome.unwrap_or(Err(ClientError::Cancelled))
}

#[tauri::command]
pub fn api_cancel(state: State<'_, AppState>, request_id: String) {
    if let Some(handle) = state.inflight.lock().unwrap().remove(&request_id) {
        handle.abort();
    }
    if let Some(realtime) = state.realtime() {
        realtime.cancel(&request_id);
    }
}

pub async fn fetch_binary(
    app: &AppHandle,
    state: &AppState,
    path: &str,
) -> Result<vael_client::Response, ClientError> {
    if !routes::binary_allowed(path) {
        return Err(ClientError::invalid("that request is not allowed"));
    }
    let request = Request {
        accept: Some("*/*"),
        ..Request::get(path)
    };
    let response = state
        .client
        .send(&request)
        .await
        .inspect_err(|error| note_failure(app, error))?;
    if response.status == 401 {
        end_local(app, "expired");
    }
    if !response.ok() {
        return Err(ClientError::Status {
            status: response.status,
        });
    }
    Ok(response)
}

#[tauri::command]
pub async fn api_bytes(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<IpcResponse, ClientError> {
    let response = fetch_binary(&app, &state, &path).await?;
    Ok(IpcResponse::new(response.body.to_vec()))
}

#[tauri::command]
pub async fn api_text(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<String, ClientError> {
    let response = fetch_binary(&app, &state, &path).await?;
    Ok(String::from_utf8_lossy(&response.body).into_owned())
}

#[tauri::command]
pub async fn api_data_url(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<String, ClientError> {
    use base64::Engine;
    let response = fetch_binary(&app, &state, &path).await?;
    let kind = response
        .headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or("").trim().to_owned())
        .unwrap_or_default();
    if !kind.starts_with("image/") || kind.contains("svg") {
        return Err(ClientError::invalid(
            "only raster images can be shown inline",
        ));
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(&response.body);
    Ok(format!("data:{kind};base64,{encoded}"))
}

const IMAGE_TYPES: [&str; 5] = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
];
const IMAGE_LIMIT: usize = 5_000_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageResult {
    pub ok: bool,
    pub data_url: Option<String>,
    pub code: Option<String>,
    pub message: Option<String>,
    pub size: usize,
}

fn image_failure(code: &str, message: &str) -> ImageResult {
    ImageResult {
        ok: false,
        data_url: None,
        code: Some(code.to_owned()),
        message: Some(message.to_owned()),
        size: 0,
    }
}

#[tauri::command]
pub async fn api_image(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    grant: String,
    generation: u64,
) -> Result<ImageResult, ClientError> {
    use base64::Engine;
    if !routes::binary_allowed(&path) || !path.contains("/resources/") {
        return Err(ClientError::invalid("that request is not allowed"));
    }
    let request = Request {
        accept: Some("image/*"),
        ..Request::new(Method::POST, path)
            .json(serde_json::json!({ "grant": grant }))
            .generation(Some(generation))
    };
    let response = state
        .client
        .send(&request)
        .await
        .inspect_err(|error| note_failure(&app, error))?;
    if response.status == 401 {
        end_local(&app, "expired");
    }
    if !response.ok() {
        let value = response.value();
        let text = |key: &str| {
            value
                .get(key)
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned()
        };
        return Ok(image_failure(&text("code"), &text("message")));
    }
    let kind = response
        .headers
        .get(reqwest::header::CONTENT_TYPE)
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
    if response.body.len() > IMAGE_LIMIT || !IMAGE_TYPES.contains(&kind.as_str()) {
        return Ok(image_failure("unsupported_image", "unsupported image"));
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(&response.body);
    Ok(ImageResult {
        ok: true,
        data_url: Some(format!("data:{kind};base64,{encoded}")),
        code: None,
        message: None,
        size: response.body.len(),
    })
}
