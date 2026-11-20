use std::collections::HashSet;

use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Item {
    pub id: String,
    pub message_id: Option<String>,
    pub unread: bool,
    pub service_id: Option<String>,
    pub sender_domain: Option<String>,
    pub sender: Sender,
    pub subject: String,
    pub thread_id: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Sender {
    pub email: String,
    pub name: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Service {
    pub id: String,
    pub muted: bool,
    pub sender_domains: Vec<String>,
}

#[derive(Debug, Default)]
pub struct Arrivals {
    previous: Option<(i64, HashSet<String>)>,
}

impl Item {
    fn key(&self) -> &str {
        self.message_id
            .as_deref()
            .filter(|id| !id.is_empty())
            .unwrap_or(&self.id)
    }

    pub fn sender_label(&self) -> &str {
        self.sender
            .name
            .as_deref()
            .filter(|name| !name.is_empty())
            .unwrap_or(&self.sender.email)
    }
}

fn muted(item: &Item, services: &[Service]) -> bool {
    services.iter().any(|service| {
        service.muted
            && (item.service_id.as_deref() == Some(service.id.as_str())
                || item
                    .sender_domain
                    .as_deref()
                    .is_some_and(|domain| service.sender_domains.iter().any(|d| d == domain)))
    })
}

impl Arrivals {
    pub fn reset(&mut self) {
        self.previous = None;
    }

    pub fn reconcile<'a>(
        &mut self,
        total: i64,
        items: &'a [Item],
        services: &[Service],
    ) -> Vec<&'a Item> {
        let ids: HashSet<String> = items.iter().map(|item| item.key().to_owned()).collect();
        let previous = self.previous.replace((total, ids));
        let Some((previous_total, previous_ids)) = previous else {
            return Vec::new();
        };
        if total <= previous_total {
            return Vec::new();
        }
        let limit = (total - previous_total) as usize;
        items
            .iter()
            .filter(|item| {
                !previous_ids.contains(item.key()) && item.unread && !muted(item, services)
            })
            .take(limit)
            .collect()
    }
}

pub fn items(value: &Value) -> Vec<Item> {
    value
        .get("items")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|entry| serde_json::from_value(entry.clone()).ok())
                .collect()
        })
        .unwrap_or_default()
}

pub fn services(value: &Value) -> Vec<Service> {
    value
        .get("services")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|entry| serde_json::from_value(entry.clone()).ok())
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn items(ids: &[(&str, bool)]) -> Vec<Item> {
        ids.iter()
            .map(|(id, unread)| Item {
                id: (*id).into(),
                unread: *unread,
                ..Item::default()
            })
            .collect()
    }

    #[test]
    fn first_snapshot_never_notifies() {
        let mut arrivals = Arrivals::default();
        assert!(arrivals
            .reconcile(2, &items(&[("a", true), ("b", true)]), &[])
            .is_empty());
    }

    #[test]
    fn reports_only_new_unread_items() {
        let mut arrivals = Arrivals::default();
        arrivals.reconcile(1, &items(&[("a", true)]), &[]);
        let list = items(&[("b", true), ("c", false), ("a", true)]);
        let fresh = arrivals.reconcile(3, &list, &[]);
        assert_eq!(fresh.len(), 1);
        assert_eq!(fresh[0].id, "b");
    }

    #[test]
    fn ignores_muted_services() {
        let mut arrivals = Arrivals::default();
        arrivals.reconcile(0, &[], &[]);
        let mut list = items(&[("a", true)]);
        list[0].sender_domain = Some("noisy.example".into());
        let services = vec![Service {
            id: "s".into(),
            muted: true,
            sender_domains: vec!["noisy.example".into()],
        }];
        assert!(arrivals.reconcile(1, &list, &services).is_empty());
    }

    #[test]
    fn counts_do_not_decrease_into_notifications() {
        let mut arrivals = Arrivals::default();
        arrivals.reconcile(5, &items(&[("a", true)]), &[]);
        assert!(arrivals
            .reconcile(4, &items(&[("z", true)]), &[])
            .is_empty());
    }

    #[test]
    fn parses_items_from_json() {
        let value =
            json!({ "items": [{ "id": "1", "unread": true, "sender": { "email": "a@x.org" } }] });
        let parsed = super::items(&value);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].sender_label(), "a@x.org");
    }
}
