//! The program's own diagnostics, so a problem on a computer nobody on the
//! team can reach can still be understood and fixed.
//!
//! - A log file (`<data>/logs/labiia_quali.log`) receives the warnings and
//!   errors the program already reports with `log::warn!`/`log::error!`.
//! - A sudden crash leaves its cause in `<data>/logs/crash.txt`; the next
//!   start offers it to the researcher.
//! - `labiia_startup_check` runs when the window opens: it confirms the
//!   helper (the bundled Node that runs the lexical analyses) starts and
//!   finds its files, so a broken installation is named as such instead of
//!   showing up later as "R was not found".
//! - `labiia_diagnostics` gathers everything Help → Program diagnostics
//!   shows and copies into the report: versions, folders, the helper, R
//!   (where it was looked for and what was found), R packages, LibreOffice
//!   and the end of the logs. It reads no project, so the report holds no
//!   research data.

use super::helper::{self, request};
use serde_json::{Value, json};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// The log is emptied once it grows past this, so it never fills the disk.
const LOG_LIMIT: u64 = 1024 * 1024;
const APP_LOG: &str = "labiia_quali.log";
const CRASH_FILE: &str = "crash.txt";
/// How many of the latest log lines go into the report.
const TAIL_LINES: usize = 60;

fn logs_dir() -> PathBuf {
    crate::storage::user_data_dir().join("logs")
}

fn timestamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

// ── Log file ──

struct FileLogger {
    file: Mutex<Option<std::fs::File>>,
}

impl log::Log for FileLogger {
    fn enabled(&self, m: &log::Metadata) -> bool {
        // The program's own messages from Info up; the libraries' (Tauri,
        // the webview) only when they warn, so the log stays readable.
        let ours = m.target().starts_with("magnolia");
        m.level() <= if ours { log::Level::Info } else { log::Level::Warn }
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        if let Ok(mut slot) = self.file.lock() {
            if let Some(f) = slot.as_mut() {
                let _ = writeln!(f, "[{}] {} {}: {}", timestamp(), record.level(), record.target(), record.args());
            }
        }
    }

    fn flush(&self) {
        if let Ok(mut slot) = self.file.lock() {
            if let Some(f) = slot.as_mut() {
                let _ = f.flush();
            }
        }
    }
}

fn open_log(path: &Path) -> Option<std::fs::File> {
    let _ = std::fs::create_dir_all(path.parent()?);
    let too_big = std::fs::metadata(path).map(|m| m.len() > LOG_LIMIT).unwrap_or(false);
    std::fs::OpenOptions::new()
        .create(true)
        .append(!too_big)
        .write(true)
        .truncate(too_big)
        .open(path)
        .ok()
}

/// Starts the log file and the crash record. Called once the data folder is
/// known (after `storage::init`).
pub fn init(app: &AppHandle) {
    let dir = logs_dir();
    let logger = Box::new(FileLogger { file: Mutex::new(open_log(&dir.join(APP_LOG))) });
    if log::set_boxed_logger(logger).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
    log::info!(
        "labiia_quali {} started on {} {} ({})",
        app.package_info().version,
        std::env::consts::OS,
        os_version(),
        std::env::consts::ARCH
    );

    let crash = dir.join(CRASH_FILE);
    let version = app.package_info().version.to_string();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let text = format!(
            "labiia_quali {version} ({} {}) closed unexpectedly at {}\n{info}\n\n{}\n",
            std::env::consts::OS,
            std::env::consts::ARCH,
            timestamp(),
            std::backtrace::Backtrace::force_capture()
        );
        log::error!("{info}");
        if let Some(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&crash).ok() {
            let _ = f.write_all(text.as_bytes());
        }
        previous(info);
    }));
}

// ── Facts about this computer ──

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// The system's version as people know it ("15.3" on a Mac, the build
/// number on Windows).
fn os_version() -> String {
    let found = if cfg!(target_os = "macos") {
        command_output("sw_vers", &["-productVersion"])
    } else if cfg!(windows) {
        // `ver` answers in the console's own code page; only its number matters.
        command_output("cmd", &["/C", "ver"]).and_then(|v| {
            let start = v.find(|c: char| c.is_ascii_digit())?;
            let number: String = v[start..].chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
            (!number.is_empty()).then_some(number)
        })
    } else {
        command_output("uname", &["-r"])
    };
    found.unwrap_or_else(|| "?".into())
}

/// The machine's real processor: a Mac program built for Intel also runs on
/// Apple chips (through Rosetta), and then reports the wrong one.
fn machine() -> String {
    if cfg!(target_os = "macos") {
        command_output("sysctl", &["-n", "machdep.cpu.brand_string"]).unwrap_or_else(|| std::env::consts::ARCH.into())
    } else {
        std::env::consts::ARCH.into()
    }
}

fn writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".labiia-write-test-{}", std::process::id()));
    let ok = std::fs::create_dir_all(dir).is_ok() && std::fs::write(&probe, b"ok").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

fn tail(path: &Path, lines: usize) -> Vec<String> {
    let Ok(bytes) = std::fs::read(path) else { return Vec::new() };
    let text = String::from_utf8_lossy(&bytes);
    let all: Vec<&str> = text.lines().collect();
    all[all.len().saturating_sub(lines)..].iter().map(|s| s.to_string()).collect()
}

/// A helper request that gives up after `secs`, so a helper that hangs is
/// reported instead of leaving the diagnostics window waiting forever.
async fn request_within(app: &AppHandle, method: &'static str, params: Value, secs: u64) -> Result<Value, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = tx.send(request(&handle, method, params).await);
    });
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(secs))
            .unwrap_or_else(|_| Err(format!("helper-timeout: no answer in {secs} s")))
    })
    .await
    .unwrap_or_else(|e| Err(e.to_string()))
}

/// A path as people read it: without the `\\?\` prefix Windows adds to long paths.
fn path_text(p: Option<PathBuf>) -> Value {
    p.map(|p| {
        let s = p.display().to_string();
        Value::String(s.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(s))
    })
    .unwrap_or(Value::Null)
}

fn crash_text() -> Option<String> {
    std::fs::read_to_string(logs_dir().join(CRASH_FILE)).ok().filter(|s| !s.trim().is_empty())
}

// ── Commands ──

/// The quick check when the program opens: the helper starts and has its
/// files. `problem` is null when all is well; `crash` holds the cause of a
/// sudden close since the last time the researcher saw it.
#[tauri::command]
pub async fn labiia_startup_check(app: AppHandle) -> Value {
    let problem = match request_within(&app, "ping", Value::Null, 30).await {
        Ok(v) => {
            let missing = v.get("missingResources").and_then(Value::as_array).map(Vec::len).unwrap_or(0);
            (missing > 0).then(|| format!("helper-resources-missing: {}", v["missingResources"]))
        }
        Err(e) => Some(e),
    };
    if let Some(p) = &problem {
        log::error!("startup check: {p}");
    }
    json!({ "problem": problem, "crash": crash_text() })
}

/// Everything the diagnostics window shows. `packages` are the R packages
/// the analyses use (the interface's list), checked against the R found.
#[tauri::command]
pub async fn labiia_diagnostics(app: AppHandle, packages: Vec<String>) -> Value {
    let data = crate::storage::user_data_dir().to_path_buf();
    let exe = std::env::current_exe().ok();
    let node = helper::node_candidates();
    let node_found = node.iter().find(|p| p.exists()).cloned();
    let ping = request_within(&app, "ping", Value::Null, 30).await;
    // The full check runs R several times; give it time on a slow computer.
    let self_check = match &ping {
        Ok(_) => request_within(&app, "diagnostics.selfCheck", json!({ "packages": packages }), 180).await,
        Err(_) => Err("not-checked".into()),
    };
    let soffice = super::codebook::soffice();
    json!({
        "program": {
            "version": app.package_info().version.to_string(),
            "os": std::env::consts::OS,
            "osVersion": os_version(),
            "arch": std::env::consts::ARCH,
            "machine": machine(),
            "executable": path_text(exe),
            "resourceDir": path_text(app.path().resource_dir().ok()),
            "dataDir": data.display().to_string(),
            "dataWritable": writable(&data),
        },
        "node": {
            "found": path_text(node_found),
            "lookedIn": node.iter().map(|p| p.display().to_string()).collect::<Vec<_>>(),
        },
        "helperScript": path_text(helper::helper_script(&app)),
        "lexicalResources": path_text(helper::lexical_resources(&app)),
        "ping": match &ping { Ok(v) => json!({ "ok": v }), Err(e) => json!({ "error": e }) },
        "selfCheck": match &self_check { Ok(v) => json!({ "ok": v }), Err(e) => json!({ "error": e }) },
        "libreOffice": path_text(soffice),
        "crash": crash_text(),
        "logs": {
            "folder": logs_dir().display().to_string(),
            "program": tail(&logs_dir().join(APP_LOG), TAIL_LINES),
            "helper": tail(&helper::log_path(), TAIL_LINES),
        }
    })
}

/// The researcher has seen the crash notice: it is kept, renamed, for a
/// later report, and not shown again.
#[tauri::command]
pub fn labiia_dismiss_crash() {
    let dir = logs_dir();
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let _ = std::fs::rename(dir.join(CRASH_FILE), dir.join(format!("crash-{stamp}.txt")));
}

/// Opens the logs folder in Finder or Explorer.
#[tauri::command]
pub fn labiia_open_logs_folder(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = logs_dir();
    let _ = std::fs::create_dir_all(&dir);
    app.opener().open_path(dir.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}
