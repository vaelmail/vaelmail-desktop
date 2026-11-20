use tauri::AppHandle;

#[cfg(target_os = "windows")]
mod platform {
    use tauri::AppHandle;
    use tauri_plugin_opener::OpenerExt;
    use windows_registry::CURRENT_USER;

    const NAME: &str = "VaelMail";
    const PROG_ID: &str = "VaelMail.mailto";
    const CLIENT: &str = r"Software\Clients\Mail\VaelMail";
    const SETTINGS: &str = "ms-settings:defaultapps?registeredAppUser=VaelMail";

    fn write(executable: &str) -> windows_registry::Result<()> {
        let command = format!("\"{executable}\" \"%1\"");
        let icon = format!("\"{executable}\",0");
        let class = CURRENT_USER.create(format!(r"Software\Classes\{PROG_ID}"))?;
        class.set_string("", "VaelMail mail link")?;
        class.set_string("URL Protocol", "")?;
        CURRENT_USER
            .create(format!(r"Software\Classes\{PROG_ID}\DefaultIcon"))?
            .set_string("", &icon)?;
        CURRENT_USER
            .create(format!(r"Software\Classes\{PROG_ID}\shell\open\command"))?
            .set_string("", &command)?;
        CURRENT_USER.create(CLIENT)?.set_string("", NAME)?;
        let capabilities = CURRENT_USER.create(format!(r"{CLIENT}\Capabilities"))?;
        capabilities.set_string("ApplicationName", NAME)?;
        capabilities.set_string("ApplicationDescription", "Private email from VaelMail")?;
        capabilities.set_string("ApplicationIcon", &icon)?;
        CURRENT_USER
            .create(format!(r"{CLIENT}\Capabilities\URLAssociations"))?
            .set_string("mailto", PROG_ID)?;
        CURRENT_USER
            .create(r"Software\RegisteredApplications")?
            .set_string(NAME, format!(r"{CLIENT}\Capabilities"))?;
        Ok(())
    }

    pub fn register(app: &AppHandle) -> bool {
        let Some(executable) = std::env::current_exe()
            .ok()
            .and_then(|path| path.to_str().map(str::to_owned))
        else {
            return false;
        };
        if write(&executable).is_err() {
            return false;
        }
        app.opener().open_url(SETTINGS, None::<&str>).is_ok()
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use tauri::AppHandle;
    use tauri_plugin_deep_link::DeepLinkExt;

    pub fn register(app: &AppHandle) -> bool {
        app.deep_link().register("mailto").is_ok()
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};
    use tauri::AppHandle;

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        fn LSSetDefaultHandlerForURLScheme(scheme: CFStringRef, handler: CFStringRef) -> i32;
    }

    pub fn register(app: &AppHandle) -> bool {
        let scheme = CFString::new("mailto");
        let handler = CFString::new(&app.config().identifier);
        let status = unsafe {
            LSSetDefaultHandlerForURLScheme(
                scheme.as_concrete_TypeRef(),
                handler.as_concrete_TypeRef(),
            )
        };
        status == 0
    }
}

pub fn supported() -> bool {
    !crate::portable::active()
}

pub fn register(app: &AppHandle) -> bool {
    supported() && platform::register(app)
}
