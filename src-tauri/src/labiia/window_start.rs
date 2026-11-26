//! How labiia_quali's windows come up.
//!
//! Every window is created visible, painted in the look's background colour
//! until its page loads, instead of hidden and shown once loaded. Security
//! software for Brazilian online banking (Warsaw, by Topaz OFD) treats a
//! program that runs a browser engine in a hidden window as banking malware
//! (that is how such malware drives a browser out of sight): after the first
//! start it stops the program from launching WebView2, and the program ran
//! with no window at all. A visible window does not trip that rule.
//!
//! If the first window still cannot be created, the person is told why and
//! the program closes, instead of staying open with no window.

use tauri::AppHandle;
use tauri::window::Color;

/// The look's background colour, so a window shows no white flash while its
/// page loads (the light and dark Windows looks of labiia-shell.css).
pub fn background() -> Color {
    let theme = crate::storage::load_preferences()
        .get("theme")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if theme.contains("dark") {
        Color(0x1F, 0x1F, 0x1F, 0xFF)
    } else {
        Color(0xF3, 0xF4, 0xF6, 0xFF)
    }
}

/// The first window (welcome or main) could not be created: say so and quit,
/// so the program does not linger with no window.
pub fn first_window_failed(app: &AppHandle, error: &str) {
    log::error!("no window could be opened: {error}");
    let text = format!(
        "{}\n\n{}",
        crate::i18n::t("labiia.windowFailedTitle"),
        crate::i18n::t("labiia.windowFailedDetail")
    );
    show_error(&text);
    app.exit(1);
}

#[cfg(windows)]
fn show_error(text: &str) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MessageBoxW};
    use windows::core::HSTRING;
    let text = HSTRING::from(text);
    let caption = HSTRING::from("labiia_quali");
    unsafe { MessageBoxW(Some(HWND::default()), &text, &caption, MB_OK | MB_ICONERROR) };
}

#[cfg(not(windows))]
fn show_error(text: &str) {
    eprintln!("{text}");
}
