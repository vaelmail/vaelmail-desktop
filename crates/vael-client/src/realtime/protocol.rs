use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

pub const VERSION: i64 = 1;
pub const MAX_SUBSCRIPTIONS: usize = 12;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Subscription {
    pub key: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pages: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RpcResponse {
    pub status: u16,
    pub value: Value,
}

impl RpcResponse {
    pub fn uncertain(message: &str) -> Self {
        Self {
            status: 409,
            value: json!({ "code": "operation_uncertain", "message": message }),
        }
    }
}

pub const TIMEOUT_MESSAGE: &str = "This change may have been saved. Refresh before retrying.";
pub const LOST_MESSAGE: &str =
    "Connection lost. Refresh to check whether your change was saved before retrying.";

pub fn subscribe_frame(queries: &[Subscription]) -> String {
    json!({ "version": VERSION, "type": "subscribe", "queries": queries }).to_string()
}

pub fn cancel_frame(id: &str) -> String {
    json!({ "version": VERSION, "type": "cancel", "id": id }).to_string()
}

pub fn request_frame(
    id: &str,
    path: &str,
    method: &str,
    body: Option<&Value>,
    generation: Option<u64>,
) -> String {
    let mut frame = Map::new();
    frame.insert("version".into(), json!(VERSION));
    frame.insert("type".into(), json!("request"));
    frame.insert("id".into(), json!(id));
    frame.insert("path".into(), json!(path));
    frame.insert("method".into(), json!(method));
    if let Some(body) = body {
        frame.insert("body".into(), body.clone());
    }
    if let Some(generation) = generation {
        frame.insert("generation".into(), json!(generation));
    }
    Value::Object(frame).to_string()
}

pub fn is_snapshot(frame: &Value) -> bool {
    frame.get("bootstrap").is_some_and(Value::is_object)
        && frame.get("inbox").is_some_and(Value::is_object)
        && frame.get("threads").is_some_and(Value::is_array)
        && frame.get("queries").is_some_and(Value::is_array)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn request_frames_omit_missing_fields() {
        let frame: Value =
            serde_json::from_str(&request_frame("id", "/api/webmail/mail", "GET", None, None))
                .unwrap();
        assert_eq!(frame["version"], 1);
        assert_eq!(frame["type"], "request");
        assert!(frame.get("body").is_none());
        assert!(frame.get("generation").is_none());
    }

    #[test]
    fn request_frames_carry_body_and_generation() {
        let body = json!({ "a": 1 });
        let frame: Value =
            serde_json::from_str(&request_frame("id", "/p", "POST", Some(&body), Some(1))).unwrap();
        assert_eq!(frame["body"], body);
        assert_eq!(frame["generation"], 1);
    }

    #[test]
    fn snapshots_need_every_section() {
        let complete = json!({ "bootstrap": {}, "inbox": {}, "threads": [], "queries": [] });
        assert!(is_snapshot(&complete));
        assert!(!is_snapshot(&json!({ "bootstrap": {}, "inbox": {} })));
    }

    #[test]
    fn uncertain_responses_use_conflict_status() {
        let response = RpcResponse::uncertain("x");
        assert_eq!(response.status, 409);
        assert_eq!(response.value["code"], "operation_uncertain");
    }
}
