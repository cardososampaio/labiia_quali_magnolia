//! Commands behind `window.api.lexical`, the lexical analyses' bridge.
//!
//! Analyses, R checks and package installs run in the Node helper (see
//! `helper.rs`); these commands pass the request on and return its answer.
//! Choosing the Rscript file and saving a result file need a native dialog,
//! so they are done here.

use super::helper::request;
use base64::Engine;
use serde_json::{Value, json};
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub async fn lexical_r_status(app: AppHandle, refresh: Option<bool>) -> CmdResult<Value> {
    request(&app, "lexical.rStatus", json!({ "refresh": refresh.unwrap_or(false) })).await
}

/// An empty path goes back to finding R automatically.
#[tauri::command]
pub async fn lexical_r_set_path(app: AppHandle, path: String) -> CmdResult<Value> {
    request(&app, "lexical.setRPath", json!({ "path": path })).await
}

#[tauri::command]
pub async fn lexical_r_pick_path(app: AppHandle, window: WebviewWindow) -> CmdResult<Option<String>> {
    let mut d = app.dialog().file().set_title("Rscript").set_parent(&window);
    if cfg!(windows) {
        d = d.add_filter("Rscript", &["exe"]);
    }
    Ok(d
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn lexical_r_check_packages(app: AppHandle, packages: Vec<String>) -> CmdResult<Value> {
    request(&app, "lexical.checkPackages", json!({ "packages": packages })).await
}

/// Progress arrives as `lexical-r-install-progress` events.
#[tauri::command]
pub async fn lexical_r_install_packages(app: AppHandle, packages: Vec<String>) -> CmdResult<Value> {
    request(&app, "lexical.installPackages", json!({ "packages": packages })).await
}

#[tauri::command]
pub async fn lexical_r_cancel_install(app: AppHandle) -> CmdResult<Value> {
    request(&app, "lexical.cancelInstall", Value::Null).await
}

/// Runs one test on the texts the interface sends. Progress arrives as
/// `lexical-run-progress` events; the result carries its files in base64.
#[tauri::command]
pub async fn lexical_run(app: AppHandle, req: Value) -> CmdResult<Value> {
    request(&app, "lexical.run", req).await
}

#[tauri::command]
pub async fn lexical_cancel_run(app: AppHandle, run_id: String) -> CmdResult<Value> {
    request(&app, "lexical.cancelRun", json!({ "runId": run_id })).await
}

/// Saves a result file (figure, table) where the researcher chooses.
/// Returns false when the dialog is cancelled.
#[tauri::command]
pub async fn lexical_save_file(
    app: AppHandle,
    window: WebviewWindow,
    name: String,
    data: String,
) -> CmdResult<bool> {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_string()).unwrap_or_default();
    let mut d = app.dialog().file().set_file_name(&name).set_parent(&window);
    if !ext.is_empty() {
        d = d.add_filter(ext.to_uppercase(), &[ext.as_str()]);
    }
    let Some(path) = d.blocking_save_file().and_then(|p| p.into_path().ok()) else {
        return Ok(false);
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}
