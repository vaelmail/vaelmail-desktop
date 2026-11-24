use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::{Options, Reporter, PAYLOAD};

fn stage_payload(
    target: &Path,
    reporter: &Reporter,
    from: f32,
    to: f32,
    label: &str,
) -> Result<(), String> {
    let mut file = fs::File::create(target)
        .map_err(|_| "Setup could not write to the temporary folder.".to_owned())?;
    let chunk = 1 << 20;
    let total = PAYLOAD.len().max(1);
    for (index, part) in PAYLOAD.chunks(chunk).enumerate() {
        file.write_all(part)
            .map_err(|_| "There is not enough free space to install VaelMail.".to_owned())?;
        let done = ((index + 1) * chunk).min(total) as f32 / total as f32;
        reporter.step(from + (to - from) * done, label);
    }
    file.sync_all()
        .map_err(|_| "Setup could not finish writing VaelMail.".to_owned())
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn wait_with_progress(
    mut child: std::process::Child,
    reporter: &Reporter,
    from: f32,
    to: f32,
    label: &str,
) -> Result<std::process::ExitStatus, String> {
    let started = std::time::Instant::now();
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|_| "Setup lost track of the installer.".to_owned())?
        {
            return Ok(status);
        }
        let elapsed = started.elapsed().as_secs_f32();
        reporter.step(from + (to - from) * (1.0 - (-elapsed / 3.5).exp()), label);
        std::thread::sleep(std::time::Duration::from_millis(120));
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use std::os::windows::process::CommandExt;
    use std::time::Duration;

    use super::*;
    use crate::version;

    pub const NAME: &str = "windows";
    const NO_WINDOW: u32 = 0x0800_0000;
    const WEBVIEW: &str = r"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

    fn registered_dir() -> Option<PathBuf> {
        windows_registry::CURRENT_USER
            .open(r"Software\VaelMail\VaelMail")
            .ok()?
            .get_string("")
            .ok()
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
    }

    pub fn default_dir() -> Option<PathBuf> {
        registered_dir().or_else(|| {
            std::env::var_os("LOCALAPPDATA")
                .map(|local| PathBuf::from(local).join("Programs").join("VaelMail"))
        })
    }

    fn program(dir: &Path) -> Option<PathBuf> {
        ["VaelMail.exe", "vaelmail-desktop.exe"]
            .iter()
            .map(|name| dir.join(name))
            .find(|path| path.is_file())
    }

    pub fn installed() -> Option<PathBuf> {
        program(&default_dir()?)
    }

    fn staged() -> PathBuf {
        std::env::temp_dir().join(format!("VaelMail-{}-setup.exe", version()))
    }

    pub fn install(options: &Options, reporter: &Reporter) -> Result<PathBuf, String> {
        reporter.step(2.0, "Preparing");
        let dir = options
            .dir
            .as_ref()
            .map(PathBuf::from)
            .or_else(default_dir)
            .ok_or_else(|| "Setup could not find your programs folder.".to_owned())?;
        let installer = staged();
        stage_payload(&installer, reporter, 2.0, 14.0, "Preparing")?;
        let mut command = Command::new(&installer);
        command.arg("/S");
        if !options.desktop {
            command.arg("/NODESKTOP");
        }
        if options.autostart {
            command.arg("/AUTOSTART");
        }
        command.raw_arg(format!("/D={}", dir.display()));
        command.creation_flags(NO_WINDOW);
        let child = command
            .spawn()
            .map_err(|_| "Windows did not let setup start the installer.".to_owned())?;
        let status = wait_with_progress(child, reporter, 14.0, 90.0, "Installing VaelMail")?;
        let _ = fs::remove_file(&installer);
        if !status.success() {
            return Err(format!(
                "The installer stopped with code {}. Close VaelMail if it is running and try again.",
                status.code().unwrap_or(-1)
            ));
        }
        reporter.step(94.0, "Adding shortcuts");
        std::thread::sleep(Duration::from_millis(300));
        let exe = program(&dir)
            .ok_or_else(|| "VaelMail was installed, but its program file is missing.".to_owned())?;
        reporter.step(100.0, "Done");
        Ok(exe)
    }

    pub fn uninstall(_reporter: &Reporter) -> Result<(), String> {
        Err("Remove VaelMail from Settings, Apps on Windows.".into())
    }

    pub fn launch(path: &Path) -> Result<(), String> {
        Command::new(path)
            .spawn()
            .map(drop)
            .map_err(|_| "VaelMail could not be opened.".to_owned())
    }

    fn webview_present() -> bool {
        let readable = |key: &windows_registry::Key, path: &str| {
            key.open(path)
                .and_then(|entry| entry.get_string("pv"))
                .is_ok_and(|value| !value.is_empty() && value != "0.0.0.0")
        };
        readable(
            windows_registry::LOCAL_MACHINE,
            &format!(r"SOFTWARE\WOW6432Node\{WEBVIEW}"),
        ) || readable(
            windows_registry::LOCAL_MACHINE,
            &format!(r"SOFTWARE\{WEBVIEW}"),
        ) || readable(
            windows_registry::CURRENT_USER,
            &format!(r"Software\{WEBVIEW}"),
        )
    }

    pub fn needs_fallback() -> bool {
        !PAYLOAD.is_empty() && !webview_present()
    }

    pub fn passthrough(arguments: &[String]) -> Option<i32> {
        if PAYLOAD.is_empty() || !arguments.iter().any(|argument| argument.starts_with('/')) {
            return None;
        }
        let installer = staged();
        if fs::write(&installer, PAYLOAD).is_err() {
            return Some(1);
        }
        let mut command = Command::new(&installer);
        for argument in arguments {
            if argument.starts_with("/D=") {
                command.raw_arg(argument);
            } else {
                command.arg(argument);
            }
        }
        let code = command
            .status()
            .ok()
            .and_then(|status| status.code())
            .unwrap_or(1);
        let _ = fs::remove_file(&installer);
        Some(code)
    }

    pub fn fallback() -> Result<(), String> {
        let installer = staged();
        fs::write(&installer, PAYLOAD)
            .map_err(|_| "Setup could not write to the temporary folder.".to_owned())?;
        Command::new(&installer)
            .spawn()
            .map(drop)
            .map_err(|_| "The standard installer could not start.".to_owned())
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use super::*;

    pub const NAME: &str = "macos";

    fn home() -> Option<PathBuf> {
        std::env::var_os("HOME").map(PathBuf::from)
    }

    fn writable(dir: &Path) -> bool {
        let probe = dir.join(format!(".vaelmail-setup-{}", std::process::id()));
        let ok = fs::write(&probe, b"").is_ok();
        let _ = fs::remove_file(&probe);
        ok
    }

    pub fn default_dir() -> Option<PathBuf> {
        let system = PathBuf::from("/Applications");
        if writable(&system) {
            return Some(system);
        }
        home().map(|home| home.join("Applications"))
    }

    pub fn installed() -> Option<PathBuf> {
        let mut places = vec![PathBuf::from("/Applications/VaelMail.app")];
        if let Some(home) = home() {
            places.push(home.join("Applications/VaelMail.app"));
        }
        places.into_iter().find(|path| path.is_dir())
    }

    pub fn install(_options: &Options, reporter: &Reporter) -> Result<PathBuf, String> {
        reporter.step(3.0, "Preparing");
        let work = std::env::temp_dir().join(format!("vaelmail-setup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&work);
        fs::create_dir_all(&work)
            .map_err(|_| "Setup could not use the temporary folder.".to_owned())?;
        let archive = work.join("VaelMail.app.tar.gz");
        stage_payload(&archive, reporter, 3.0, 20.0, "Preparing")?;
        let child = Command::new("tar")
            .arg("-xzf")
            .arg(&archive)
            .arg("-C")
            .arg(&work)
            .spawn()
            .map_err(|_| "Setup could not unpack VaelMail.".to_owned())?;
        if !wait_with_progress(child, reporter, 20.0, 55.0, "Unpacking VaelMail")?.success() {
            return Err("The VaelMail package is damaged. Download setup again.".into());
        }
        let source = fs::read_dir(&work)
            .map_err(|_| "Setup could not read the unpacked app.".to_owned())?
            .flatten()
            .map(|entry| entry.path())
            .find(|path| path.extension().is_some_and(|extension| extension == "app"))
            .ok_or_else(|| "The VaelMail package is damaged. Download setup again.".to_owned())?;
        let target_dir = default_dir()
            .ok_or_else(|| "Setup could not find your Applications folder.".to_owned())?;
        fs::create_dir_all(&target_dir)
            .map_err(|_| "Setup could not create your Applications folder.".to_owned())?;
        let target = target_dir.join("VaelMail.app");
        reporter.step(62.0, "Moving VaelMail to Applications");
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|_| {
                "Quit VaelMail and try again: the old version is still in use.".to_owned()
            })?;
        }
        let child = Command::new("ditto")
            .arg(&source)
            .arg(&target)
            .spawn()
            .map_err(|_| "Setup could not copy VaelMail.".to_owned())?;
        if !wait_with_progress(
            child,
            reporter,
            62.0,
            90.0,
            "Moving VaelMail to Applications",
        )?
        .success()
        {
            return Err("Setup could not copy VaelMail into Applications.".into());
        }
        reporter.step(94.0, "Finishing");
        let _ = Command::new("xattr")
            .args(["-dr", "com.apple.quarantine"])
            .arg(&target)
            .status();
        let _ = fs::remove_dir_all(&work);
        reporter.step(100.0, "Done");
        Ok(target)
    }

    pub fn uninstall(_reporter: &Reporter) -> Result<(), String> {
        Err("Drag VaelMail from Applications to the Trash to remove it.".into())
    }

    pub fn launch(path: &Path) -> Result<(), String> {
        Command::new("open")
            .arg(path)
            .spawn()
            .map(drop)
            .map_err(|_| "VaelMail could not be opened.".to_owned())
    }

    pub fn needs_fallback() -> bool {
        false
    }

    pub fn passthrough(_arguments: &[String]) -> Option<i32> {
        None
    }

    pub fn fallback() -> Result<(), String> {
        Err("There is no other installer on macOS.".into())
    }
}

#[cfg(target_os = "linux")]
mod imp {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    pub const NAME: &str = "linux";
    const ICON: &[u8] = include_bytes!("../../src-tauri/icons/128x128.png");

    fn home() -> Option<PathBuf> {
        std::env::var_os("HOME").map(PathBuf::from)
    }

    fn data() -> Option<PathBuf> {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| home().map(|home| home.join(".local/share")))
    }

    fn config() -> Option<PathBuf> {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| home().map(|home| home.join(".config")))
    }

    fn desktop_dir() -> Option<PathBuf> {
        Command::new("xdg-user-dir")
            .arg("DESKTOP")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|text| PathBuf::from(text.trim()))
            .filter(|path| path.is_dir() && Some(path.as_path()) != home().as_deref())
            .or_else(|| {
                home()
                    .map(|home| home.join("Desktop"))
                    .filter(|path| path.is_dir())
            })
    }

    pub fn default_dir() -> Option<PathBuf> {
        data().map(|data| data.join("vaelmail"))
    }

    fn image(dir: &Path) -> PathBuf {
        dir.join("VaelMail.AppImage")
    }

    pub fn installed() -> Option<PathBuf> {
        default_dir()
            .map(|dir| image(&dir))
            .filter(|path| path.is_file())
    }

    fn entry(exec: &Path, extra: &str) -> String {
        format!(
            "[Desktop Entry]\nType=Application\nName=VaelMail\nGenericName=Email\nComment=Private email\nExec=\"{}\"{} %u\nIcon=vaelmail\nTerminal=false\nCategories=Network;Email;\nMimeType=x-scheme-handler/mailto;\nStartupWMClass=VaelMail\nStartupNotify=true\n",
            exec.display(),
            extra
        )
    }

    fn write_file(path: &Path, contents: &[u8], mode: u32) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|_| format!("Setup could not create {}.", parent.display()))?;
        }
        fs::write(path, contents)
            .map_err(|_| format!("Setup could not write {}.", path.display()))?;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
        Ok(())
    }

    fn shortcuts() -> Vec<PathBuf> {
        let mut paths = Vec::new();
        if let Some(data) = data() {
            paths.push(data.join("applications/vaelmail.desktop"));
            paths.push(data.join("icons/hicolor/128x128/apps/vaelmail.png"));
        }
        if let Some(config) = config() {
            paths.push(config.join("autostart/vaelmail.desktop"));
        }
        if let Some(desktop) = desktop_dir() {
            paths.push(desktop.join("vaelmail.desktop"));
        }
        if let Some(home) = home() {
            paths.push(home.join(".local/bin/vaelmail"));
        }
        paths
    }

    pub fn install(options: &Options, reporter: &Reporter) -> Result<PathBuf, String> {
        reporter.step(3.0, "Preparing");
        let dir = options
            .dir
            .as_ref()
            .map(PathBuf::from)
            .or_else(default_dir)
            .ok_or_else(|| "Setup could not find your home folder.".to_owned())?;
        fs::create_dir_all(&dir)
            .map_err(|_| format!("Setup could not create {}.", dir.display()))?;
        let target = image(&dir);
        let staging = dir.join(".VaelMail.AppImage.part");
        stage_payload(&staging, reporter, 5.0, 80.0, "Copying VaelMail")?;
        let _ = fs::set_permissions(&staging, fs::Permissions::from_mode(0o755));
        fs::rename(&staging, &target).map_err(|_| {
            "Quit VaelMail and try again: the old version is still in use.".to_owned()
        })?;
        reporter.step(86.0, "Adding VaelMail to your apps");
        let data = data().ok_or_else(|| "Setup could not find your home folder.".to_owned())?;
        write_file(
            &data.join("icons/hicolor/128x128/apps/vaelmail.png"),
            ICON,
            0o644,
        )?;
        let launcher = data.join("applications/vaelmail.desktop");
        write_file(&launcher, entry(&target, "").as_bytes(), 0o644)?;
        let _ = Command::new("update-desktop-database")
            .arg(data.join("applications"))
            .status();
        if let Some(home) = home() {
            let link = home.join(".local/bin/vaelmail");
            if let Some(parent) = link.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::remove_file(&link);
            let _ = std::os::unix::fs::symlink(&target, &link);
        }
        reporter.step(93.0, "Adding shortcuts");
        if options.desktop {
            if let Some(desktop) = desktop_dir() {
                let shortcut = desktop.join("vaelmail.desktop");
                write_file(&shortcut, entry(&target, "").as_bytes(), 0o755)?;
                let _ = Command::new("gio")
                    .args(["set"])
                    .arg(&shortcut)
                    .args(["metadata::trusted", "true"])
                    .status();
            }
        }
        if let Some(config) = config() {
            let autostart = config.join("autostart/vaelmail.desktop");
            if options.autostart {
                write_file(&autostart, entry(&target, " --hidden").as_bytes(), 0o644)?;
            } else {
                let _ = fs::remove_file(&autostart);
            }
        }
        reporter.step(100.0, "Done");
        Ok(target)
    }

    pub fn uninstall(reporter: &Reporter) -> Result<(), String> {
        reporter.step(10.0, "Removing VaelMail");
        if let Some(dir) = default_dir() {
            let _ = fs::remove_file(image(&dir));
            let _ = fs::remove_dir(&dir);
        }
        reporter.step(60.0, "Removing shortcuts");
        for path in shortcuts() {
            let _ = fs::remove_file(path);
        }
        if let Some(data) = data() {
            let _ = Command::new("update-desktop-database")
                .arg(data.join("applications"))
                .status();
        }
        reporter.step(100.0, "Done");
        Ok(())
    }

    pub fn launch(path: &Path) -> Result<(), String> {
        Command::new(path)
            .spawn()
            .map(drop)
            .map_err(|_| "VaelMail could not be opened.".to_owned())
    }

    pub fn needs_fallback() -> bool {
        false
    }

    pub fn passthrough(_arguments: &[String]) -> Option<i32> {
        None
    }

    pub fn fallback() -> Result<(), String> {
        Err("There is no other installer on Linux.".into())
    }
}

pub use imp::{
    default_dir, fallback, install, installed, launch, needs_fallback, passthrough, uninstall, NAME,
};

pub fn decorate(window: &tauri::WebviewWindow) {
    let _ = window.set_decorations(false);
    let _ = window.set_shadow(true);
}
