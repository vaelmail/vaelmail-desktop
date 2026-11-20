use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

const WEBMAIL_PREFIX: &str = "/api/webmail/";

static FORBIDDEN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)[\\#\x00-\x20]|%2e|%2f|%5c|\.\.").unwrap());

static BILLING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^/api/billing/(options(\?[^#]*)?|orders(/[a-f0-9-]{36})?)$").unwrap()
});

static ROUTE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"^(bootstrap|sync|mail|threads|drafts|jobs|domains|services|rules|settings|timezone|",
        r"actions|undo|tracking|contacts|aliases|folders|labels|identities|saved-searches|",
        r"filters|attachments|messages)(/[-a-zA-Z0-9_]+)*$"
    ))
    .unwrap()
});

static EXCLUDED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^sender-icon|/source$|/resources/").unwrap());

static BINARY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"^/api/webmail/(sender-icon(\?.*)?|attachments/[a-f0-9-]{36}(/preview)?|",
        r"messages/[-a-zA-Z0-9_]+/(source|resources/[-a-zA-Z0-9_]+))$"
    ))
    .unwrap()
});

fn is_activity_ping(body: Option<&Value>) -> bool {
    let Some(Value::Object(map)) = body else {
        return false;
    };
    map.len() == 1 && map.get("action").and_then(Value::as_str) == Some("activity")
}

pub fn socket_allowed(path: &str, method: &str, body: Option<&Value>) -> bool {
    if path.len() > 8192 || FORBIDDEN.is_match(path) {
        return false;
    }
    if BILLING.is_match(path) {
        return method == "GET";
    }
    if path == "/api/account" {
        return method == "GET" || (method == "POST" && is_activity_ping(body));
    }
    if !path.starts_with(WEBMAIL_PREFIX)
        || !["GET", "POST", "PATCH", "DELETE", "PUT"].contains(&method)
    {
        return false;
    }
    let route = path[WEBMAIL_PREFIX.len()..].split('?').next().unwrap_or("");
    if !ROUTE.is_match(route) || EXCLUDED.is_match(route) {
        return false;
    }
    if route.starts_with("attachments") {
        return method == "DELETE";
    }
    true
}

pub fn binary_allowed(path: &str) -> bool {
    path.len() <= 8192 && !FORBIDDEN.is_match(path) && BINARY.is_match(path)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn allows_known_webmail_routes() {
        assert!(socket_allowed("/api/webmail/bootstrap", "GET", None));
        assert!(socket_allowed(
            "/api/webmail/mail?view=inbox&limit=30",
            "GET",
            None
        ));
        assert!(socket_allowed("/api/webmail/threads/abc-123", "GET", None));
        assert!(socket_allowed(
            "/api/webmail/actions",
            "POST",
            Some(&json!({}))
        ));
        assert!(socket_allowed("/api/webmail/drafts/abc/send", "POST", None));
    }

    #[test]
    fn rejects_binary_and_unknown_routes() {
        assert!(!socket_allowed(
            "/api/webmail/sender-icon?domain=a.com",
            "GET",
            None
        ));
        assert!(!socket_allowed(
            "/api/webmail/messages/abc/source",
            "GET",
            None
        ));
        assert!(!socket_allowed(
            "/api/webmail/messages/abc/resources/x",
            "POST",
            None
        ));
        assert!(!socket_allowed("/api/webmail/unknown", "GET", None));
        assert!(!socket_allowed("/api/session", "POST", None));
    }

    #[test]
    fn attachments_only_allow_delete() {
        assert!(!socket_allowed("/api/webmail/attachments/abc", "GET", None));
        assert!(!socket_allowed("/api/webmail/attachments", "POST", None));
        assert!(socket_allowed(
            "/api/webmail/attachments/abc",
            "DELETE",
            None
        ));
    }

    #[test]
    fn account_route_allows_only_activity_pings() {
        assert!(socket_allowed("/api/account", "GET", None));
        let ping = json!({ "action": "activity" });
        assert!(socket_allowed("/api/account", "POST", Some(&ping)));
        let other = json!({ "action": "delete" });
        assert!(!socket_allowed("/api/account", "POST", Some(&other)));
        let extra = json!({ "action": "activity", "x": 1 });
        assert!(!socket_allowed("/api/account", "POST", Some(&extra)));
    }

    #[test]
    fn billing_routes_are_read_only() {
        assert!(socket_allowed("/api/billing/options?months=3", "GET", None));
        assert!(!socket_allowed("/api/billing/options", "POST", None));
        assert!(!socket_allowed("/api/billing/orders", "POST", None));
    }

    #[test]
    fn rejects_traversal_and_encoded_separators() {
        assert!(!socket_allowed("/api/webmail/mail/../account", "GET", None));
        assert!(!socket_allowed("/api/webmail/mail%2f..", "GET", None));
        assert!(!socket_allowed("/api/webmail/mail #x", "GET", None));
    }

    #[test]
    fn binary_routes_are_restricted() {
        assert!(binary_allowed("/api/webmail/sender-icon?domain=a.com"));
        assert!(binary_allowed("/api/webmail/messages/abc/source"));
        assert!(binary_allowed(
            "/api/webmail/attachments/123e4567-e89b-12d3-a456-426614174000/preview"
        ));
        assert!(!binary_allowed("/api/webmail/bootstrap"));
        assert!(!binary_allowed("/api/webmail/attachments/../x"));
    }
}
