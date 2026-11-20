use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ClientError {
    #[error("offline")]
    Offline,
    #[error("session ended")]
    SessionEnded,
    #[error("verification required, retry in {retry_after}s")]
    Challenge { retry_after: u64 },
    #[error("cancelled")]
    Cancelled,
    #[error("server answered {status}")]
    Status { status: u16 },
    #[error("{message}")]
    Invalid { message: String },
}

impl ClientError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid {
            message: message.into(),
        }
    }
}

impl From<reqwest::Error> for ClientError {
    fn from(error: reqwest::Error) -> Self {
        if error.is_connect() || error.is_timeout() {
            Self::Offline
        } else if error.is_builder() {
            Self::invalid("the request could not be built")
        } else {
            Self::Offline
        }
    }
}

pub type Result<T> = std::result::Result<T, ClientError>;
