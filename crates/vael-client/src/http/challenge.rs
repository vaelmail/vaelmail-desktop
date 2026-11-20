use std::time::Duration;

use reqwest::header::{HeaderMap, RETRY_AFTER};
use serde::Deserialize;

use super::pow::Puzzle;

pub const LEVEL_HEADER: &str = "x-vael-challenge";
pub const SOLVE_COOLDOWN: Duration = Duration::from_secs(15);
pub const PAUSE: Duration = Duration::from_millis(400);
pub const MAX_ATTEMPTS: usize = 3;

#[derive(Debug)]
pub enum Challenge {
    Pause,
    Solve(Puzzle),
    Blocked { retry_after: u64 },
}

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
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(0)
}

fn retry_after(headers: &HeaderMap) -> u64 {
    headers
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(5)
}

pub fn classify(headers: &HeaderMap, body: &[u8]) -> Option<Challenge> {
    match level(headers) {
        0 => None,
        1 => Some(Challenge::Pause),
        2 => match serde_json::from_slice::<PowBody>(body) {
            Ok(PowBody { pow: Some(fields) }) => Some(Challenge::Solve(Puzzle {
                seed: fields.c,
                difficulty: fields.d,
                count: fields.s,
            })),
            _ => Some(Challenge::Blocked {
                retry_after: retry_after(headers),
            }),
        },
        _ => Some(Challenge::Blocked {
            retry_after: retry_after(headers),
        }),
    }
}

pub fn submission(puzzle: &Puzzle, nonces: &[u32]) -> String {
    let mut form = format!(
        "r=%2F&c={}",
        percent_encoding::utf8_percent_encode(&puzzle.seed, percent_encoding::NON_ALPHANUMERIC)
    );
    for (index, nonce) in nonces.iter().enumerate() {
        form.push_str(&format!("&n{index}={nonce}"));
    }
    form
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
    fn no_header_means_no_challenge() {
        assert!(classify(&HeaderMap::new(), b"").is_none());
    }

    #[test]
    fn level_one_pauses() {
        assert!(matches!(
            classify(&headers("1"), b""),
            Some(Challenge::Pause)
        ));
    }

    #[test]
    fn level_two_parses_the_puzzle() {
        let body = br#"{"pow":{"c":"seed","d":14,"s":4}}"#;
        match classify(&headers("2"), body) {
            Some(Challenge::Solve(puzzle)) => {
                assert_eq!(puzzle.seed, "seed");
                assert_eq!(puzzle.difficulty, 14);
                assert_eq!(puzzle.count, 4);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn unsolvable_levels_block_with_retry_after() {
        assert!(matches!(
            classify(&headers("3"), b""),
            Some(Challenge::Blocked { retry_after: 7 })
        ));
        assert!(matches!(
            classify(&headers("2"), b"not json"),
            Some(Challenge::Blocked { retry_after: 7 })
        ));
    }

    #[test]
    fn submission_encodes_every_nonce() {
        let puzzle = Puzzle {
            seed: "a b".into(),
            difficulty: 1,
            count: 2,
        };
        assert_eq!(submission(&puzzle, &[5, 9]), "r=%2F&c=a%20b&n0=5&n1=9");
    }
}
