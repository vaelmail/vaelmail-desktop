use std::collections::BTreeMap;
use std::sync::Mutex;

use reqwest::header::{HeaderMap, SET_COOKIE};

#[derive(Default)]
pub struct Jar {
    cookies: Mutex<BTreeMap<String, String>>,
}

impl Jar {
    pub fn store(&self, headers: &HeaderMap) {
        let mut cookies = self.cookies.lock().unwrap();
        for value in headers.get_all(SET_COOKIE) {
            let Ok(text) = value.to_str() else { continue };
            let mut parts = text.split(';');
            let Some((name, value)) = parts.next().and_then(|pair| pair.split_once('=')) else {
                continue;
            };
            let name = name.trim().to_owned();
            let value = value.trim().to_owned();
            let expired = value.is_empty()
                || parts.any(|attribute| {
                    attribute
                        .trim()
                        .split_once('=')
                        .is_some_and(|(key, number)| {
                            key.eq_ignore_ascii_case("max-age")
                                && number.trim().parse::<i64>().is_ok_and(|age| age <= 0)
                        })
                });
            if expired {
                cookies.remove(&name);
            } else {
                cookies.insert(name, value);
            }
        }
    }

    pub fn header(&self) -> Option<String> {
        let cookies = self.cookies.lock().unwrap();
        if cookies.is_empty() {
            return None;
        }
        Some(
            cookies
                .iter()
                .map(|(name, value)| format!("{name}={value}"))
                .collect::<Vec<_>>()
                .join("; "),
        )
    }

    pub fn get(&self, name: &str) -> Option<String> {
        self.cookies.lock().unwrap().get(name).cloned()
    }

    pub fn set(&self, name: &str, value: &str) {
        self.cookies
            .lock()
            .unwrap()
            .insert(name.to_owned(), value.to_owned());
    }

    pub fn remove(&self, name: &str) {
        self.cookies.lock().unwrap().remove(name);
    }

    pub fn clear(&self) {
        self.cookies.lock().unwrap().clear();
    }
}

#[cfg(test)]
mod tests {
    use reqwest::header::HeaderValue;

    use super::*;

    fn headers(values: &[&str]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for value in values {
            map.append(SET_COOKIE, HeaderValue::from_str(value).unwrap());
        }
        map
    }

    #[test]
    fn stores_and_joins_cookies() {
        let jar = Jar::default();
        jar.store(&headers(&["__Host-a=1; Path=/; Secure", "b=2; HttpOnly"]));
        assert_eq!(jar.get("__Host-a").as_deref(), Some("1"));
        assert_eq!(jar.header().as_deref(), Some("__Host-a=1; b=2"));
    }

    #[test]
    fn expired_cookies_are_removed() {
        let jar = Jar::default();
        jar.store(&headers(&["a=1"]));
        jar.store(&headers(&["a=; Max-Age=0"]));
        assert!(jar.get("a").is_none());
        jar.store(&headers(&["b=2"]));
        jar.store(&headers(&["b=3; Max-Age=0"]));
        assert!(jar.header().is_none());
    }
}
