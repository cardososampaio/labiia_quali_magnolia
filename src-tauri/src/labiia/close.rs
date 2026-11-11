//! Closing labiia_quali's project window.
//!
//! The researcher is asked before the program closes ("Fechar o
//! labiia_quali?", No by default), so a stray click on the window's ×
//! does not end the session. The project is saved automatically before
//! closing either way, as in Magnolia. Closing the project window ends the
//! program, as labiia_quali has always done, instead of returning to the
//! welcome window. No question is asked when the program restarts to
//! install an update.

use crate::state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, CloseRequestApi, Manager};

/// The researcher said yes; the next close request goes through.
static CONFIRMED: AtomicBool = AtomicBool::new(false);
/// A question is on screen; further close requests wait for it.
static ASKING: AtomicBool = AtomicBool::new(false);

/// Called first when the project window is asked to close. Returns true when
/// the close was held back (the question is showing, or was answered no).
pub fn intercept(app: &AppHandle, label: &str, api: &CloseRequestApi) -> bool {
    if CONFIRMED.load(Ordering::SeqCst) {
        return false;
    }
    let state = app.state::<AppState>();
    if state.ui.lock().unwrap().restart_after_quit {
        return false;
    }
    api.prevent_close();
    if ASKING.swap(true, Ordering::SeqCst) {
        return true;
    }
    let app = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        let window = app.get_webview_window(&label);
        let yes = ask(&app, window.as_ref());
        ASKING.store(false, Ordering::SeqCst);
        let state = app.state::<AppState>();
        if yes {
            CONFIRMED.store(true, Ordering::SeqCst);
            // The program ends once the project is saved and the window gone.
            state.ui.lock().unwrap().is_quitting = true;
            if let Some(w) = window {
                let _ = w.close();
            }
        } else {
            // A Quit from the menu that was cancelled is no longer quitting.
            state.ui.lock().unwrap().is_quitting = false;
        }
    });
    true
}

/// Windows' own question box, with "No" as the default button, so pressing
/// Enter by accident keeps the program open. Its buttons read Yes / No in
/// the language of Windows.
#[cfg(windows)]
fn ask(_app: &AppHandle, window: Option<&tauri::WebviewWindow>) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        IDYES, MB_DEFBUTTON2, MB_ICONQUESTION, MB_YESNO, MessageBoxW,
    };
    use windows::core::HSTRING;
    let owner = window
        .and_then(|w| w.hwnd().ok())
        .map(|h| HWND(h.0 as _))
        .unwrap_or_default();
    let text = HSTRING::from(format!(
        "{}\n\n{}",
        crate::i18n::t("labiia.closeTitle"),
        crate::i18n::t("labiia.closeDetail")
    ));
    let caption = HSTRING::from("labiia_quali");
    let answer = unsafe { MessageBoxW(Some(owner), &text, &caption, MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2) };
    answer == IDYES
}

#[cfg(not(windows))]
fn ask(app: &AppHandle, window: Option<&tauri::WebviewWindow>) -> bool {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    let mut dialog = app
        .dialog()
        .message(crate::i18n::t("labiia.closeDetail"))
        .title(crate::i18n::t("labiia.closeTitle"))
        .buttons(MessageDialogButtons::OkCancelCustom(
            crate::i18n::t("labiia.closeYes"),
            crate::i18n::t("labiia.closeCancel"),
        ));
    if let Some(w) = window {
        dialog = dialog.parent(w);
    }
    dialog.blocking_show()
}
