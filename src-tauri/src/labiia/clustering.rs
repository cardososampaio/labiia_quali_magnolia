//! Qualitative coding analysis runs outside the webview and off the UI thread.

use labiia_analysis::clustering::{self, Request, Result as ClusterResult};

#[tauri::command]
pub async fn cluster_coding_profiles(request: Request) -> Result<ClusterResult, String> {
    tauri::async_runtime::spawn_blocking(move || clustering::analyze(request))
        .await
        .map_err(|error| error.to_string())
}
