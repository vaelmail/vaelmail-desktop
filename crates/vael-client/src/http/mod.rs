mod challenge;
mod cookies;
mod pow;
mod proxy;

use std::sync::{Arc, RwLock};
use std::time::Instant;

use bytes::Bytes;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE, COOKIE, ORIGIN, USER_AGENT};
use reqwest::Method;
use serde_json::Value;
use tokio::sync::Mutex;

use crate::config::{self, GENERATION_HEADER, OPERATION_HEADER, ORIGIN as SITE_ORIGIN};
use crate::error::{ClientError, Result};

pub use cookies::Jar;
pub use proxy::{open as open_tunnel, ProxyMode, ProxySettings};

use challenge::Challenge;

pub enum Body {
    None,
    Json(Value),
    Form(String),
    Upload(Upload),
}

#[derive(Clone)]
pub struct Upload {
    pub draft_id: String,
    pub file_name: String,
    pub file_type: String,
    pub data: Bytes,
    pub progress: Option<Arc<dyn Fn(u8) + Send + Sync>>,
}

const UPLOAD_CHUNK: usize = 64 * 1024;

fn upload_body(upload: &Upload) -> reqwest::Body {
    let data = upload.data.clone();
    let total = data.len().max(1);
    let progress = upload.progress.clone();
    let chunks = (0..data.len()).step_by(UPLOAD_CHUNK).map(move |start| {
        let end = (start + UPLOAD_CHUNK).min(data.len());
        if let Some(report) = &progress {
            report((end * 100 / total) as u8);
        }
        Ok::<Bytes, std::io::Error>(data.slice(start..end))
    });
    reqwest::Body::wrap_stream(futures_util::stream::iter(chunks))
}

pub struct Request {
    pub method: Method,
    pub path: String,
    pub body: Body,
    pub generation: Option<u64>,
    pub operation: Option<String>,
    pub accept: Option<&'static str>,
}

impl Request {
    pub fn get(path: impl Into<String>) -> Self {
        Self::new(Method::GET, path)
    }

    pub fn new(method: Method, path: impl Into<String>) -> Self {
        Self {
            method,
            path: path.into(),
            body: Body::None,
            generation: None,
            operation: None,
            accept: None,
        }
    }

    pub fn json(mut self, value: Value) -> Self {
        self.body = Body::Json(value);
        self
    }

    pub fn generation(mut self, generation: Option<u64>) -> Self {
        self.generation = generation;
        self
    }

    pub fn operation(mut self, operation: Option<String>) -> Self {
        self.operation = operation;
        self
    }
}

pub struct Response {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Bytes,
}

impl Response {
    pub fn is_json(&self) -> bool {
        self.headers
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("application/json"))
    }

    pub fn value(&self) -> Value {
        if self.is_json() {
            return serde_json::from_slice(&self.body).unwrap_or_else(|_| {
                failure("invalid_response", "unexpected server response format")
            });
        }
        match self.status {
            413 => failure("request_too_large", "request payload is too large"),
            500.. => failure("server_error", "server communication failure"),
            _ => failure("network_error", "server communication failure"),
        }
    }

    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

pub fn failure(code: &str, message: &str) -> Value {
    serde_json::json!({ "code": code, "message": message })
}

pub struct Client {
    http: RwLock<reqwest::Client>,
    proxy: RwLock<ProxySettings>,
    jar: Arc<Jar>,
    agent: String,
    solving: Mutex<Option<Instant>>,
}

fn build(agent: &str, proxy: &ProxySettings) -> Result<reqwest::Client> {
    let builder = reqwest::Client::builder()
        .user_agent(agent)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(15))
        .read_timeout(std::time::Duration::from_secs(60));
    proxy
        .apply(builder)?
        .build()
        .map_err(|_| ClientError::invalid("the network stack could not start"))
}

impl Client {
    pub fn new(version: &str, proxy: &ProxySettings) -> Result<Self> {
        let agent = config::user_agent(version);
        Ok(Self {
            http: RwLock::new(build(&agent, proxy)?),
            proxy: RwLock::new(proxy.clone()),
            jar: Arc::new(Jar::default()),
            agent,
            solving: Mutex::new(None),
        })
    }

    pub fn set_proxy(&self, proxy: &ProxySettings) -> Result<()> {
        *self.http.write().unwrap() = build(&self.agent, proxy)?;
        *self.proxy.write().unwrap() = proxy.clone();
        Ok(())
    }

    pub fn tunnel_proxy(&self) -> Option<url::Url> {
        self.proxy.read().unwrap().resolved()
    }

    pub fn jar(&self) -> &Jar {
        &self.jar
    }

    pub fn agent(&self) -> &str {
        &self.agent
    }

    pub fn cookie_header(&self) -> Option<String> {
        self.jar.header()
    }

    fn url(path: &str) -> String {
        format!("{SITE_ORIGIN}{path}")
    }

    fn prepare(&self, request: &Request) -> Result<reqwest::RequestBuilder> {
        let client = self.http.read().unwrap().clone();
        let mut builder = client.request(request.method.clone(), Self::url(&request.path));
        builder = builder
            .header(ORIGIN, HeaderValue::from_static(SITE_ORIGIN))
            .header(USER_AGENT, &self.agent)
            .header(
                ACCEPT,
                request.accept.unwrap_or("application/json, */*;q=0.8"),
            );
        if let Some(cookie) = self.jar.header() {
            builder = builder.header(COOKIE, cookie);
        }
        if let Some(generation) = request.generation {
            builder = builder.header(GENERATION_HEADER, generation.to_string());
        }
        if let Some(operation) = &request.operation {
            builder = builder.header(OPERATION_HEADER, operation);
        }
        builder = match &request.body {
            Body::None => builder,
            Body::Json(value) => builder
                .header(CONTENT_TYPE, "application/json")
                .body(serde_json::to_vec(value).map_err(|_| ClientError::invalid("bad body"))?),
            Body::Form(text) => builder
                .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
                .body(text.clone()),
            Body::Upload(upload) => {
                let part = reqwest::multipart::Part::stream_with_length(
                    upload_body(upload),
                    upload.data.len() as u64,
                )
                .file_name(upload.file_name.clone())
                .mime_str(&upload.file_type)
                .map_err(|_| ClientError::invalid("unsupported file type"))?;
                builder.multipart(
                    reqwest::multipart::Form::new()
                        .part("file", part)
                        .text("draftId", upload.draft_id.clone()),
                )
            }
        };
        Ok(builder)
    }

    async fn solve(&self, puzzle: pow::Puzzle) -> bool {
        let mut last = self.solving.lock().await;
        if last.is_some_and(|at| at.elapsed() < challenge::SOLVE_COOLDOWN) {
            return false;
        }
        let Ok(Some(nonces)) = tokio::task::spawn_blocking({
            let puzzle = puzzle.clone();
            move || pow::solve(&puzzle)
        })
        .await
        else {
            return false;
        };
        let request = Request::new(Method::POST, "/.vp/pow");
        let Ok(builder) = self.prepare(&request) else {
            return false;
        };
        let sent = builder
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(challenge::submission(&puzzle, &nonces))
            .send()
            .await;
        let Ok(response) = sent else { return false };
        self.jar.store(response.headers());
        *last = Some(Instant::now());
        true
    }

    async fn execute(&self, request: &Request) -> Result<reqwest::Response> {
        for attempt in 0..challenge::MAX_ATTEMPTS {
            let response = self.prepare(request)?.send().await?;
            self.jar.store(response.headers());
            if response.status().as_u16() != 429 || challenge::level(response.headers()) == 0 {
                return Ok(response);
            }
            let headers = response.headers().clone();
            let body = response.bytes().await.unwrap_or_default();
            let last = attempt + 1 == challenge::MAX_ATTEMPTS;
            match challenge::classify(&headers, &body) {
                Some(Challenge::Pause) if !last => tokio::time::sleep(challenge::PAUSE).await,
                Some(Challenge::Solve(puzzle)) if !last => {
                    if !self.solve(puzzle).await {
                        return Err(ClientError::Challenge { retry_after: 15 });
                    }
                }
                Some(Challenge::Blocked { retry_after }) => {
                    return Err(ClientError::Challenge { retry_after })
                }
                _ => return Err(ClientError::Challenge { retry_after: 5 }),
            }
        }
        Err(ClientError::Challenge { retry_after: 5 })
    }

    pub async fn send(&self, request: &Request) -> Result<Response> {
        let response = self.execute(request).await?;
        let status = response.status().as_u16();
        let headers = response.headers().clone();
        let body = response.bytes().await?;
        Ok(Response {
            status,
            headers,
            body,
        })
    }

    pub async fn stream(&self, request: &Request) -> Result<reqwest::Response> {
        self.execute(request).await
    }
}
