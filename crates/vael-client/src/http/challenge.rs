use reqwest::header::{HeaderMap, RETRY_AFTER, SET_COOKIE};
use serde::Deserialize;

use super::pow::Puzzle;

pub const LEVEL_HEADER: &str = "x-vael-challenge";
pub const CLEARANCE_COOKIES: [&str; 2] = ["__Host-vp", "vp"];
pub const MAX_ATTEMPTS: usize = 3;

#[derive(Deserialize)]
struct PowBody {
    pow: Option<PowFields>,
}

#[derive(Deserialize)]
struct PowFields {
    c: String,
    d: u32,
    s: u32,
}

pub fn level(headers: &HeaderMap) -> u8 {
    headers
        .get(LEVEL_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u8>().ok())
        .map_or(0, |level| level.min(3))
}

pub fn retry_after(headers: &HeaderMap) -> u64 {
    headers
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(5)
}

pub fn json_puzzle(body: &[u8]) -> Option<Puzzle> {
    let fields = serde_json::from_slice::<PowBody>(body).ok()?.pow?;
    valid_puzzle(Puzzle {
        seed: fields.c,
        difficulty: fields.d,
        count: fields.s,
    })
}

fn valid_puzzle(puzzle: Puzzle) -> Option<Puzzle> {
    let ok = !puzzle.seed.is_empty()
        && puzzle.seed.is_ascii()
        && puzzle.seed.len() <= 128
        && (1..=32).contains(&puzzle.difficulty)
        && (1..=32).contains(&puzzle.count);
    ok.then_some(puzzle)
}

pub fn sets_clearance(headers: &HeaderMap) -> bool {
    headers.get_all(SET_COOKIE).iter().any(|value| {
        let Ok(text) = value.to_str() else {
            return false;
        };
        let Some((name, rest)) = text.split_once('=') else {
            return false;
        };
        let value = rest.split(';').next().unwrap_or_default().trim();
        CLEARANCE_COOKIES.contains(&name.trim()) && !value.is_empty()
    })
}

pub fn submission(puzzle: &Puzzle, nonces: &[u32]) -> String {
    let mut form = format!("r=%2F&c={}", encode(&puzzle.seed));
    for (index, nonce) in nonces.iter().enumerate() {
        form.push_str(&format!("&n{index}={nonce}"));
    }
    form
}

pub fn captcha_answer(token: &str, answer: &str) -> String {
    format!("r=%2F&t={}&a={}", encode(token), encode(answer.trim()))
}

fn encode(value: &str) -> String {
    percent_encoding::utf8_percent_encode(value, percent_encoding::NON_ALPHANUMERIC).to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Page {
    Pow(Puzzle),
    Captcha(Captcha),
    Wait(Wait),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Captcha {
    pub token: String,
    pub image: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Wait {
    pub token: String,
    pub seconds: u64,
}

fn value_at(text: &str) -> Option<&str> {
    if let Some(rest) = text.strip_prefix('"') {
        return rest.find('"').map(|end| &rest[..end]);
    }
    let end = text
        .find(|c: char| c.is_ascii_whitespace() || c == '>')
        .unwrap_or(text.len());
    Some(&text[..end])
}

fn attribute<'a>(html: &'a str, key: &str) -> Option<&'a str> {
    let marker = format!("{key}=");
    let mut from = 0;
    while let Some(found) = html[from..].find(&marker) {
        let start = from + found;
        let boundary = start == 0 || html.as_bytes()[start - 1].is_ascii_whitespace();
        if boundary {
            return value_at(&html[start + marker.len()..]);
        }
        from = start + marker.len();
    }
    None
}

fn token_chars(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'=' | b'+' | b'/')
        })
}

fn hidden(html: &str, name: &str) -> Option<String> {
    for marker in [format!("name={name} "), format!("name=\"{name}\"")] {
        let mut from = 0;
        while let Some(found) = html[from..].find(&marker) {
            let start = from + found;
            let tag_end = html[start..]
                .find('>')
                .map_or(html.len(), |end| start + end);
            if let Some(value) = attribute(&html[start..tag_end], "value") {
                if token_chars(value) {
                    return Some(value.to_owned());
                }
                return None;
            }
            from = start + marker.len();
        }
    }
    None
}

fn form_action(html: &str, target: &str) -> bool {
    html.contains(&format!("action={target}")) || html.contains(&format!("action=\"{target}"))
}

fn refresh_wait(html: &str) -> Option<Wait> {
    let mut from = 0;
    while let Some(found) = html[from..].find("http-equiv=") {
        let start = from + found;
        let tag_end = html[start..]
            .find('>')
            .map_or(html.len(), |end| start + end);
        let tag = &html[start..tag_end];
        from = start + 11;
        let Some(content) = attribute(tag, "content") else {
            continue;
        };
        let Some((seconds, target)) = content.split_once(';') else {
            continue;
        };
        let Some(rest) = target.split_once("/.vp/wait?t=").map(|(_, rest)| rest) else {
            continue;
        };
        let token = rest.split('&').next().unwrap_or_default();
        if !token_chars(token) {
            return None;
        }
        return Some(Wait {
            token: token.to_owned(),
            seconds: seconds.trim().parse().ok()?,
        });
    }
    None
}

pub fn page(html: &str) -> Option<Page> {
    if form_action(html, "/.vp/pow") {
        let puzzle = Puzzle {
            seed: hidden(html, "c")?,
            difficulty: attribute(html, "data-d")?.trim().parse().ok()?,
            count: attribute(html, "data-s")?.trim().parse().ok()?,
        };
        return valid_puzzle(puzzle).map(Page::Pow);
    }
    if form_action(html, "/.vp/captcha") {
        let start = html.find("data:image/png;base64,")? + "data:image/png;base64,".len();
        let image = value_at(&format!("\"{}", &html[start..]))?.to_owned();
        let image_ok = !image.is_empty()
            && image.len() <= 64 * 1024
            && image
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'='));
        if !image_ok {
            return None;
        }
        return Some(Page::Captcha(Captcha {
            token: hidden(html, "t")?,
            image,
        }));
    }
    refresh_wait(html).map(Page::Wait)
}

#[cfg(test)]
mod tests {
    use reqwest::header::HeaderValue;

    use super::*;

    fn headers(level: &str) -> HeaderMap {
        let mut map = HeaderMap::new();
        map.insert(LEVEL_HEADER, HeaderValue::from_str(level).unwrap());
        map.insert(RETRY_AFTER, HeaderValue::from_static("7"));
        map
    }

    #[test]
    fn reads_the_level_header() {
        assert_eq!(level(&HeaderMap::new()), 0);
        assert_eq!(level(&headers("1")), 1);
        assert_eq!(level(&headers("3")), 3);
        assert_eq!(level(&headers("9")), 3);
        assert_eq!(retry_after(&headers("2")), 7);
    }

    #[test]
    fn reads_the_json_puzzle() {
        let body =
            br#"{"error":"verification_required","level":2,"pow":{"c":"seed","d":14,"s":4}}"#;
        let puzzle = json_puzzle(body).expect("puzzle");
        assert_eq!(puzzle.seed, "seed");
        assert_eq!(puzzle.difficulty, 14);
        assert_eq!(puzzle.count, 4);
        assert!(json_puzzle(br#"{"error":"verification_required","level":3}"#).is_none());
        assert!(json_puzzle(br#"{"pow":{"c":"seed","d":40,"s":4}}"#).is_none());
        assert!(json_puzzle(b"not json").is_none());
    }

    #[test]
    fn submissions_encode_every_value() {
        let puzzle = Puzzle {
            seed: "a b".into(),
            difficulty: 1,
            count: 2,
        };
        assert_eq!(submission(&puzzle, &[5, 9]), "r=%2F&c=a%20b&n0=5&n1=9");
        assert_eq!(captcha_answer("t+1", " ab3 "), "r=%2F&t=t%2B1&a=ab3");
    }

    #[test]
    fn spots_clearance_cookies() {
        let mut map = HeaderMap::new();
        map.append(
            SET_COOKIE,
            HeaderValue::from_static("__Host-vp-t=; Max-Age=0"),
        );
        assert!(!sets_clearance(&map));
        map.append(
            SET_COOKIE,
            HeaderValue::from_static("__Host-vp=abc; Path=/; Secure; HttpOnly; SameSite=Lax"),
        );
        assert!(sets_clearance(&map));
    }

    const POW: &str = r#"<h1>checking your connection.</h1><p id=s aria-live=polite>working</p><noscript><meta http-equiv=refresh content="1;url=/.vp/captcha?r=%2F"></noscript><form id=f method=post action=/.vp/pow data-d="15" data-s="8"><input type=hidden name=c value="AbC-_09xyz"><input type=hidden name=r value="/"></form><script></script>"#;
    const CAPTCHA: &str = r#"<form method=post action="/.vp/captcha?p=0"><div class=p><img src="data:image/png;base64,iVBORw0KGgo=" width=160 height=56 alt="code"></div><input type=hidden name=t value="Tok_en-1"><input type=hidden name=r value="/"><input class=in name=a required></form><p><a href="/.vp/captcha?w=1&amp;p=0&amp;r=%2F">wait 30 seconds instead</a>.</p>"#;
    const WAIT: &str = r#"<head><title>vaelmail</title><meta http-equiv=refresh content="30;url=/.vp/wait?t=W41t_tok-en&amp;r=%2F"></head><h1>checking your connection.</h1>"#;
    const QUOTED: &str = r#"<form id="f" method="post" action="/.vp/pow" data-d="15" data-s="8"><input type="hidden" name="c" value="AbC-_09xyz"><input type="hidden" name="r" value="/"></form>"#;

    #[test]
    fn reads_challenge_pages() {
        assert_eq!(
            page(POW),
            Some(Page::Pow(Puzzle {
                seed: "AbC-_09xyz".into(),
                difficulty: 15,
                count: 8
            }))
        );
        assert_eq!(
            page(CAPTCHA),
            Some(Page::Captcha(Captcha {
                token: "Tok_en-1".into(),
                image: "iVBORw0KGgo=".into()
            }))
        );
        assert_eq!(
            page(WAIT),
            Some(Page::Wait(Wait {
                token: "W41t_tok-en".into(),
                seconds: 30
            }))
        );
        assert_eq!(page(QUOTED), page(POW));
        assert_eq!(page("<html><body>VaelMail</body></html>"), None);
    }

    #[test]
    fn rejects_odd_markup() {
        let forged = POW.replace("AbC-_09xyz", "a<b c");
        assert_eq!(page(&forged), None);
        let huge = POW.replace("data-d=\"15\"", "data-d=\"99\"");
        assert_eq!(page(&huge), None);
    }
}
