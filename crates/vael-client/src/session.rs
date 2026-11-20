use serde::Serialize;
use serde_json::{json, Value};

use crate::config::{LOGIN_COOKIE, ORIGIN, SESSION_COOKIE};
use crate::error::Result;
use crate::http::{Client, Request, Response};
use reqwest::Method;

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Outcome {
    SignedIn,
    Factor { methods: Vec<String> },
    Waiting,
    Rejected { status: u16, code: String },
}

pub struct Handoff {
    pub url: String,
    pub code: String,
    pub redeem: String,
    pub expires_in: u64,
}

pub enum HandoffStart {
    Started(Handoff),
    Rejected(Outcome),
}

fn rejected(response: &Response) -> Outcome {
    let code = response
        .value()
        .get("code")
        .and_then(|value| value.as_str())
        .unwrap_or("request_failed")
        .to_owned();
    Outcome::Rejected {
        status: response.status,
        code,
    }
}

fn signed_in(client: &Client, response: &Response) -> bool {
    response.ok() && client.jar().get(SESSION_COOKIE).is_some()
}

pub async fn start(client: &Client, account_key: &str) -> Result<Outcome> {
    client.jar().remove(LOGIN_COOKIE);
    let request = Request::new(Method::POST, "/api/session")
        .json(json!({ "action": "start", "accountKey": account_key }));
    let response = client.send(&request).await?;
    if signed_in(client, &response) {
        return Ok(Outcome::SignedIn);
    }
    if !response.ok() {
        return Ok(rejected(&response));
    }
    let methods = response
        .value()
        .get("methods")
        .and_then(|value| value.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|entry| entry.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();
    Ok(Outcome::Factor { methods })
}

pub async fn finish(client: &Client, factor: &str) -> Result<Outcome> {
    let request = Request::new(Method::POST, "/api/session")
        .json(json!({ "action": "finish", "factor": factor }));
    let response = client.send(&request).await?;
    if signed_in(client, &response) {
        client.jar().remove(LOGIN_COOKIE);
        return Ok(Outcome::SignedIn);
    }
    Ok(rejected(&response))
}

fn field(response: &Response, name: &str) -> Option<String> {
    response
        .value()
        .get(name)
        .and_then(|value| value.as_str())
        .map(str::to_owned)
}

pub async fn handoff_start(client: &Client) -> Result<HandoffStart> {
    let request =
        Request::new(Method::POST, "/api/session").json(json!({ "action": "desktop-handoff" }));
    started(client.send(&request).await?)
}

pub async fn action_handoff_start(client: &Client, target: Value) -> Result<HandoffStart> {
    let request = Request::new(Method::POST, "/api/account/desktop-passkey").json(target);
    started(client.send(&request).await?)
}

fn started(response: Response) -> Result<HandoffStart> {
    if !response.ok() {
        return Ok(HandoffStart::Rejected(rejected(&response)));
    }
    let (Some(browser), Some(redeem), Some(code)) = (
        field(&response, "browser"),
        field(&response, "redeem"),
        field(&response, "code"),
    ) else {
        return Ok(HandoffStart::Rejected(Outcome::Rejected {
            status: response.status,
            code: "invalid_response".into(),
        }));
    };
    let expires_in = response
        .value()
        .get("expiresIn")
        .and_then(|value| value.as_u64())
        .unwrap_or(300);
    Ok(HandoffStart::Started(Handoff {
        url: format!("{ORIGIN}/desktop/passkey#{browser}"),
        code,
        redeem,
        expires_in,
    }))
}

pub async fn handoff_poll(client: &Client, redeem: &str) -> Result<Outcome> {
    let request = Request::new(Method::POST, "/api/desktop/handoff")
        .json(json!({ "action": "poll", "redeem": redeem }));
    let response = client.send(&request).await?;
    if signed_in(client, &response) {
        client.jar().remove(LOGIN_COOKIE);
        return Ok(Outcome::SignedIn);
    }
    if response.ok() {
        return Ok(Outcome::Waiting);
    }
    Ok(rejected(&response))
}

pub enum ActionPoll {
    Waiting,
    Ready(Value),
    Rejected(Outcome),
}

pub async fn action_handoff_poll(client: &Client, redeem: &str) -> Result<ActionPoll> {
    let request = Request::new(Method::POST, "/api/desktop/handoff")
        .json(json!({ "action": "poll", "redeem": redeem, "kind": "action" }));
    let response = client.send(&request).await?;
    if !response.ok() {
        return Ok(ActionPoll::Rejected(rejected(&response)));
    }
    Ok(match response.value().get("proof") {
        Some(proof) if !proof.is_null() => ActionPoll::Ready(proof.clone()),
        _ => ActionPoll::Waiting,
    })
}

pub async fn end(client: &Client) -> Result<()> {
    let request = Request::new(Method::DELETE, "/api/session");
    let _ = client.send(&request).await;
    client.jar().clear();
    Ok(())
}

pub fn token(client: &Client) -> Option<String> {
    client.jar().get(SESSION_COOKIE)
}

pub fn restore(client: &Client, token: &str) {
    client.jar().set(SESSION_COOKIE, token);
}
