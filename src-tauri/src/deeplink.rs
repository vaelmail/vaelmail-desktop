use tauri::{AppHandle, Manager};
use vael_client::mailto::{self, Mailto};

use crate::events::{self, MAILTO_PENDING, OPEN_INBOX};
use crate::jumplist::{COMPOSE_FLAG, INBOX_FLAG};
use crate::lifecycle;
use crate::state::AppState;

pub fn queue(app: &AppHandle, message: Mailto) {
    app.state::<AppState>()
        .pending_mailto
        .lock()
        .unwrap()
        .push(message);
    lifecycle::show_main(app);
    events::emit(app, MAILTO_PENDING, ());
}

pub fn flags<I, S>(app: &AppHandle, arguments: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    for argument in arguments {
        match argument.as_ref() {
            COMPOSE_FLAG => queue(app, Mailto::default()),
            INBOX_FLAG => {
                lifecycle::show_main(app);
                events::emit(app, OPEN_INBOX, ());
            }
            _ => {}
        }
    }
}

pub fn handle<I, S>(app: &AppHandle, urls: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    for url in urls {
        if let Some(message) = mailto::parse(url.as_ref()) {
            queue(app, message);
        }
    }
}
