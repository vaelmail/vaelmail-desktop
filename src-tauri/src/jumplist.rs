pub const COMPOSE_FLAG: &str = "--compose";
pub const INBOX_FLAG: &str = "--inbox";

#[cfg(target_os = "windows")]
mod platform {
    use tauri::AppHandle;
    use windows::core::{Interface, Result, HSTRING};
    use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::Variant::VT_LPWSTR;
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW,
        SHStrDupW, SetCurrentProcessExplicitAppUserModelID, ShellLink,
    };

    use super::{COMPOSE_FLAG, INBOX_FLAG};

    fn title_value(title: &str) -> Result<PROPVARIANT> {
        unsafe {
            let text = SHStrDupW(&HSTRING::from(title))?;
            let mut value = PROPVARIANT::default();
            let inner = &mut *value.Anonymous.Anonymous;
            inner.vt = VT_LPWSTR;
            inner.Anonymous.pwszVal = text;
            Ok(value)
        }
    }

    fn task(executable: &HSTRING, argument: &str, title: &str) -> Result<IShellLinkW> {
        unsafe {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            link.SetPath(executable)?;
            link.SetArguments(&HSTRING::from(argument))?;
            link.SetIconLocation(executable, 0)?;
            link.SetDescription(&HSTRING::from(title))?;
            let store: IPropertyStore = link.cast()?;
            store.SetValue(&PKEY_Title, &title_value(title)?)?;
            store.Commit()?;
            Ok(link)
        }
    }

    fn build(identifier: &str) -> Result<()> {
        let executable = HSTRING::from(std::env::current_exe()?.as_os_str());
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let list: ICustomDestinationList =
                CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
            list.SetAppID(&HSTRING::from(identifier))?;
            let mut slots = 0u32;
            let _removed: IObjectArray = list.BeginList(&mut slots)?;
            let tasks: IObjectCollection =
                CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
            tasks.AddObject(&task(&executable, COMPOSE_FLAG, "New message")?)?;
            tasks.AddObject(&task(&executable, INBOX_FLAG, "Inbox")?)?;
            list.AddUserTasks(&tasks.cast::<IObjectArray>()?)?;
            list.CommitList()?;
        }
        Ok(())
    }

    pub fn install(app: &AppHandle) {
        if crate::portable::active() {
            return;
        }
        let identifier = app.config().identifier.clone();
        unsafe {
            let _ = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(identifier.as_str()));
        }
        std::thread::spawn(move || {
            let _ = build(&identifier);
        });
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn install(_app: &tauri::AppHandle) {}
}

pub use platform::install;
