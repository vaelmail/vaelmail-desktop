use std::path::{Path, PathBuf};
use std::sync::OnceLock;

pub const MARKER: &str = "VaelMail.portable";
const DATA: &str = "VaelMail Data";

static ROOT: OnceLock<Option<PathBuf>> = OnceLock::new();

pub fn root() -> Option<&'static Path> {
    ROOT.get_or_init(detect).as_deref()
}

pub fn active() -> bool {
    root().is_some()
}

pub fn folder(name: &str) -> Option<PathBuf> {
    root().map(|root| root.join(name))
}

fn detect() -> Option<PathBuf> {
    if let Some(forced) = std::env::var_os("VAEL_PORTABLE_DIR") {
        return Some(PathBuf::from(forced));
    }
    let base = location()?;
    base.join(MARKER).is_file().then(|| base.join(DATA))
}

fn location() -> Option<PathBuf> {
    if let Some(image) = std::env::var_os("APPIMAGE") {
        return PathBuf::from(image).parent().map(Path::to_path_buf);
    }
    let executable = std::env::current_exe().ok()?;
    let directory = executable.parent()?;
    if cfg!(target_os = "macos") {
        if let Some(bundle) = directory
            .ancestors()
            .find(|path| path.extension().is_some_and(|extension| extension == "app"))
        {
            return bundle.parent().map(Path::to_path_buf);
        }
    }
    Some(directory.to_path_buf())
}
