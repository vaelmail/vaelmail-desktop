#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("secure storage is unavailable")]
    SecretsUnavailable,
    #[error("storage failed: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("file access failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("stored data is invalid: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, StoreError>;
