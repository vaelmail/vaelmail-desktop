use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio_socks::tcp::Socks5Stream;
use url::Url;

use crate::error::{ClientError, Result};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProxyMode {
    #[default]
    System,
    None,
    Manual,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProxySettings {
    pub mode: ProxyMode,
    pub url: String,
}

impl ProxySettings {
    pub fn resolved(&self) -> Option<Url> {
        match self.mode {
            ProxyMode::None => None,
            ProxyMode::Manual => Url::parse(&self.url).ok(),
            ProxyMode::System => ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]
                .iter()
                .find_map(|name| std::env::var(name).ok())
                .and_then(|value| Url::parse(&value).ok()),
        }
    }

    pub fn apply(&self, builder: reqwest::ClientBuilder) -> Result<reqwest::ClientBuilder> {
        match self.mode {
            ProxyMode::System => Ok(builder),
            ProxyMode::None => Ok(builder.no_proxy()),
            ProxyMode::Manual => {
                let proxy = reqwest::Proxy::all(&self.url)
                    .map_err(|_| ClientError::invalid("the proxy address is not valid"))?;
                Ok(builder.proxy(proxy))
            }
        }
    }
}

pub async fn open(proxy: Option<&Url>, host: &str, port: u16) -> Result<TcpStream> {
    let Some(proxy) = proxy else {
        return TcpStream::connect((host, port))
            .await
            .map_err(|_| ClientError::Offline);
    };
    let proxy_host = proxy
        .host_str()
        .ok_or_else(|| ClientError::invalid("the proxy address is not valid"))?;
    let proxy_port = proxy.port_or_known_default().unwrap_or(1080);
    match proxy.scheme() {
        "socks5" | "socks5h" => {
            let stream = Socks5Stream::connect((proxy_host, proxy_port), (host, port))
                .await
                .map_err(|_| ClientError::Offline)?;
            Ok(stream.into_inner())
        }
        "http" | "https" => connect_through_http(proxy_host, proxy_port, host, port).await,
        _ => Err(ClientError::invalid("the proxy scheme is not supported")),
    }
}

async fn connect_through_http(
    proxy_host: &str,
    proxy_port: u16,
    host: &str,
    port: u16,
) -> Result<TcpStream> {
    let mut stream = TcpStream::connect((proxy_host, proxy_port))
        .await
        .map_err(|_| ClientError::Offline)?;
    let request = format!("CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|_| ClientError::Offline)?;
    let mut reader = BufReader::new(&mut stream);
    let mut status = String::new();
    reader
        .read_line(&mut status)
        .await
        .map_err(|_| ClientError::Offline)?;
    if !status.contains(" 200") {
        return Err(ClientError::Offline);
    }
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|_| ClientError::Offline)?;
        if line == "\r\n" || line.is_empty() {
            break;
        }
    }
    Ok(stream)
}
