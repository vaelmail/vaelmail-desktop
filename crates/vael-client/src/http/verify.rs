use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use reqwest::header::{HeaderValue, CONTENT_TYPE};
use reqwest::Method;
use serde::Serialize;
use tokio::sync::{mpsc, Mutex};

use super::challenge::{self, Page};
use super::pow::{self, Puzzle};
use super::{Client, Request};

const PROBE_PATH: &str = "/favicon.ico";
const WARM_PATH: &str = "/";
const FAILURE_COOLDOWN: Duration = Duration::from_secs(10);
const CAPTCHA_PATH: &str = "/.vp/captcha?r=%2F";
const WAIT_PATH: &str = "/.vp/captcha?w=1&r=%2F";
const MAX_ROUNDS: usize = 12;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(
    tag = "phase",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Verification {
    Checking {
        level: u8,
    },
    Captcha {
        image: String,
        wait_seconds: u64,
        wrong: bool,
    },
    Done,
    Failed {
        retry_after: u64,
    },
}

#[derive(Debug, Clone)]
pub enum Answer {
    Code(String),
    NewImage,
    Cancel,
}

type Observer = Arc<dyn Fn(Verification) + Send + Sync>;

pub struct Verifier {
    running: Mutex<Option<Instant>>,
    generation: AtomicU64,
    observer: RwLock<Option<Observer>>,
    answers: mpsc::UnboundedSender<Answer>,
    inbox: Mutex<mpsc::UnboundedReceiver<Answer>>,
}

impl Default for Verifier {
    fn default() -> Self {
        let (answers, inbox) = mpsc::unbounded_channel();
        Self {
            running: Mutex::new(None),
            generation: AtomicU64::new(0),
            observer: RwLock::new(None),
            answers,
            inbox: Mutex::new(inbox),
        }
    }
}

impl Verifier {
    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
    }

    pub fn observe(&self, observer: impl Fn(Verification) + Send + Sync + 'static) {
        *self.observer.write().unwrap() = Some(Arc::new(observer));
    }

    pub fn answer(&self, answer: Answer) {
        let _ = self.answers.send(answer);
    }

    fn tell(&self, state: Verification) {
        let observer = self.observer.read().unwrap().clone();
        if let Some(observer) = observer {
            observer(state);
        }
    }
}

enum Outcome {
    Cleared,
    Failed,
}

impl Client {
    pub async fn verify(&self, level: u8, puzzle: Option<Puzzle>, seen: u64) -> bool {
        let verifier = &self.verifier;
        let mut failed_at = verifier.running.lock().await;
        if verifier.generation() != seen {
            return true;
        }
        if failed_at.is_some_and(|at| at.elapsed() < FAILURE_COOLDOWN) {
            return false;
        }
        verifier.tell(Verification::Checking { level });
        let outcome = match (level, puzzle) {
            (_, Some(puzzle)) => self.solve(&puzzle).await,
            (1 | 2, None) => self.probe().await,
            _ => self.interactive().await,
        };
        match outcome {
            Outcome::Cleared => {
                *failed_at = None;
                verifier.generation.fetch_add(1, Ordering::AcqRel);
                verifier.tell(Verification::Done);
                true
            }
            Outcome::Failed => {
                *failed_at = Some(Instant::now());
                verifier.tell(Verification::Failed {
                    retry_after: FAILURE_COOLDOWN.as_secs(),
                });
                false
            }
        }
    }

    pub async fn warm(&self) {
        let Ok(builder) = self.page(Method::HEAD, WARM_PATH) else {
            return;
        };
        if let Ok(response) = builder.send().await {
            self.jar.store(response.headers());
        }
    }

    fn page(&self, method: Method, path: &str) -> crate::error::Result<reqwest::RequestBuilder> {
        let mut request = Request::new(method, path);
        request.accept = Some("text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
        Ok(self
            .prepare(&request)?
            .header("Sec-Fetch-Mode", HeaderValue::from_static("navigate"))
            .header("Sec-Fetch-Dest", HeaderValue::from_static("document"))
            .header("Sec-Fetch-Site", HeaderValue::from_static("none"))
            .header("X-Vael-Boot", HeaderValue::from_static("1")))
    }

    async fn open(&self, path: &str) -> Result<Option<Page>, ()> {
        let response = self
            .page(Method::GET, path)
            .map_err(|_| ())?
            .send()
            .await
            .map_err(|_| ())?;
        self.jar.store(response.headers());
        if challenge::sets_clearance(response.headers()) {
            return Ok(None);
        }
        let html = is_html(response.headers());
        let status = response.status().as_u16();
        let body = response.bytes().await.map_err(|_| ())?;
        if !html {
            return if (200..400).contains(&status) {
                Ok(None)
            } else {
                Err(())
            };
        }
        challenge::page(&String::from_utf8_lossy(&body))
            .map(Some)
            .ok_or(())
    }

    async fn post_form(&self, path: &str, form: String) -> Result<reqwest::Response, ()> {
        let response = self
            .page(Method::POST, path)
            .map_err(|_| ())?
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .header("Sec-Fetch-Site", HeaderValue::from_static("same-origin"))
            .body(form)
            .send()
            .await
            .map_err(|_| ())?;
        self.jar.store(response.headers());
        Ok(response)
    }

    async fn solve(&self, puzzle: &Puzzle) -> Outcome {
        let Ok(Some(nonces)) = tokio::task::spawn_blocking({
            let puzzle = puzzle.clone();
            move || pow::solve(&puzzle)
        })
        .await
        else {
            return Outcome::Failed;
        };
        match self
            .post_form("/.vp/pow", challenge::submission(puzzle, &nonces))
            .await
        {
            Ok(response) if challenge::sets_clearance(response.headers()) => Outcome::Cleared,
            _ => Outcome::Failed,
        }
    }

    async fn probe(&self) -> Outcome {
        match self.open(PROBE_PATH).await {
            Ok(None) => Outcome::Cleared,
            Ok(Some(Page::Pow(puzzle))) => self.solve(&puzzle).await,
            Ok(Some(Page::Captcha(_) | Page::Wait(_))) => self.interactive().await,
            Err(()) => Outcome::Failed,
        }
    }

    async fn captcha(&self) -> Option<challenge::Captcha> {
        match self.open(CAPTCHA_PATH).await {
            Ok(Some(Page::Captcha(captcha))) => Some(captcha),
            _ => None,
        }
    }

    async fn wait_token(&self) -> Option<challenge::Wait> {
        match self.open(WAIT_PATH).await {
            Ok(Some(Page::Wait(wait))) => Some(wait),
            _ => None,
        }
    }

    async fn interactive(&self) -> Outcome {
        let mut inbox = self.verifier.inbox.lock().await;
        while inbox.try_recv().is_ok() {}

        let mut captcha = self.captcha().await;
        let Some(mut wait) = self.wait_token().await else {
            return Outcome::Failed;
        };
        let mut deadline = tokio::time::Instant::now() + Duration::from_secs(wait.seconds);
        let mut wrong = false;

        for _ in 0..MAX_ROUNDS * 4 {
            let left = deadline
                .saturating_duration_since(tokio::time::Instant::now())
                .as_secs();
            self.verifier.tell(Verification::Captcha {
                image: captcha
                    .as_ref()
                    .map(|captcha| captcha.image.clone())
                    .unwrap_or_default(),
                wait_seconds: left,
                wrong,
            });
            tokio::select! {
                _ = tokio::time::sleep_until(deadline) => {
                    let path = format!("/.vp/wait?t={}&r=%2F", wait.token);
                    match self.open(&path).await {
                        Ok(None) => return Outcome::Cleared,
                        Ok(Some(Page::Wait(again))) => {
                            deadline = tokio::time::Instant::now() + Duration::from_secs(again.seconds.max(1));
                            wait = again;
                        }
                        _ => return Outcome::Failed,
                    }
                }
                answer = inbox.recv() => match answer {
                    Some(Answer::Code(code)) => {
                        let Some(current) = captcha.as_ref() else { continue };
                        let form = challenge::captcha_answer(&current.token, &code);
                        let Ok(response) = self.post_form("/.vp/captcha", form).await else {
                            return Outcome::Failed;
                        };
                        if challenge::sets_clearance(response.headers()) {
                            return Outcome::Cleared;
                        }
                        let body = response.bytes().await.unwrap_or_default();
                        match challenge::page(&String::from_utf8_lossy(&body)) {
                            Some(Page::Captcha(next)) => {
                                captcha = Some(next);
                                wrong = true;
                            }
                            _ => {
                                captcha = self.captcha().await;
                                wrong = true;
                            }
                        }
                    }
                    Some(Answer::NewImage) => {
                        captcha = self.captcha().await;
                        wrong = false;
                    }
                    Some(Answer::Cancel) | None => return Outcome::Failed,
                },
            }
        }
        Outcome::Failed
    }
}

fn is_html(headers: &reqwest::header::HeaderMap) -> bool {
    headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("text/html"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verification_serializes_for_the_frontend() {
        let value = serde_json::to_value(Verification::Captcha {
            image: "x".into(),
            wait_seconds: 30,
            wrong: false,
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({"phase": "captcha", "image": "x", "waitSeconds": 30, "wrong": false})
        );
        let value = serde_json::to_value(Verification::Checking { level: 2 }).unwrap();
        assert_eq!(value, serde_json::json!({"phase": "checking", "level": 2}));
    }

    #[test]
    fn answers_reach_the_inbox() {
        let verifier = Verifier::default();
        verifier.answer(Answer::NewImage);
        let mut inbox = verifier.inbox.try_lock().unwrap();
        assert!(matches!(inbox.try_recv(), Ok(Answer::NewImage)));
    }
}
