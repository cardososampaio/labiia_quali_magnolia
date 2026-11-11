//! Starts and talks to labiia_quali's Node helper, which runs the lexical
//! analyses (TypeScript code calling R). One message per line on its
//! stdin/stdout:
//!
//!   request   {"id": 7, "method": "lexical.run", "params": {...}}
//!   response  {"id": 7, "ok": true, "result": ...}  or  {"id": 7, "ok": false, "error": "..."}
//!   event     {"event": "lexical:run-progress", "payload": {...}}
//!
//! The helper starts on the first request. If it exits (cancelled analysis
//! that took it down, antivirus, a crash), every request waiting on it fails
//! with `helper-exited` and the next request starts a new one. Its stderr
//! goes to `<user data>/logs/helper.log`, so a researcher's report can say
//! why it failed. When the app quits, the helper and everything it started
//! (R included) are stopped.

use serde_json::{Value, json};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

type Reply = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>>;

struct Running {
    child: Child,
    stdin: ChildStdin,
    pending: Pending,
}

static RUNNING: OnceLock<Mutex<Option<Running>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn running() -> &'static Mutex<Option<Running>> {
    RUNNING.get_or_init(|| Mutex::new(None))
}

/// The helper's log keeps the latest run's output; it is emptied once it
/// grows past this, so it never fills the disk.
const LOG_LIMIT: u64 = 1024 * 1024;

#[cfg(windows)]
fn hide_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn hide_window(_cmd: &mut Command) {}

fn first_existing(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|p| p.exists())
}

/// Development builds run from `target/debug`, where the bundled files may
/// not have been copied; they fall back to the repository's own folders.
fn repo_root() -> Option<PathBuf> {
    cfg!(debug_assertions).then(|| Path::new(env!("CARGO_MANIFEST_DIR")).join(".."))
}

fn node_exe() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let mut c = vec![exe_dir.join("labiia-node.exe"), exe_dir.join("labiia-node")];
    if let Some(root) = repo_root() {
        c.push(root.join("src-tauri/binaries/labiia-node-x86_64-pc-windows-msvc.exe"));
    }
    first_existing(c)
}

/// The folder that holds `helper/` and `lexical/` in an installed app.
fn resource_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = app.path().resource_dir().ok().into_iter().collect();
    if let Some(root) = repo_root() {
        dirs.push(root);
    }
    dirs
}

fn helper_script(app: &AppHandle) -> Option<PathBuf> {
    first_existing(
        resource_dirs(app)
            .into_iter()
            .flat_map(|d| [d.join("helper/labiia-helper.cjs"), d.join("helper/dist/labiia-helper.cjs")])
            .collect(),
    )
}

fn lexical_resources(app: &AppHandle) -> Option<PathBuf> {
    first_existing(
        resource_dirs(app)
            .into_iter()
            .flat_map(|d| [d.clone(), d.join("resources")])
            .filter(|d| d.join("lexical").is_dir())
            .collect(),
    )
}

fn log_path() -> PathBuf {
    crate::storage::user_data_dir().join("logs").join("helper.log")
}

fn open_log() -> Option<std::fs::File> {
    let path = log_path();
    let _ = std::fs::create_dir_all(path.parent()?);
    let too_big = std::fs::metadata(&path).map(|m| m.len() > LOG_LIMIT).unwrap_or(false);
    std::fs::OpenOptions::new()
        .create(true)
        .append(!too_big)
        .write(true)
        .truncate(too_big)
        .open(path)
        .ok()
}

fn log_line(text: &str) {
    if let Some(mut f) = open_log() {
        let _ = writeln!(f, "[{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), text);
    }
}

fn start(app: &AppHandle) -> Result<Running, String> {
    let node = node_exe().ok_or("helper-unavailable: labiia-node.exe not found next to the app")?;
    let script = helper_script(app).ok_or("helper-unavailable: helper/labiia-helper.cjs not found")?;
    let resources = lexical_resources(app).ok_or("helper-unavailable: lexical resources not found")?;
    let data = crate::storage::user_data_dir().to_path_buf();

    let mut cmd = Command::new(&node);
    cmd.arg(&script)
        .arg("--resources")
        .arg(&resources)
        .arg("--data")
        .arg(&data)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_window(&mut cmd);
    log_line(&format!("starting helper: {} {}", node.display(), script.display()));
    let mut child = cmd.spawn().map_err(|e| {
        let msg = format!("helper-unavailable: {e}");
        log_line(&msg);
        msg
    })?;

    let stdin = child.stdin.take().ok_or("helper-unavailable: no stdin")?;
    let stdout = child.stdout.take().ok_or("helper-unavailable: no stdout")?;
    let stderr = child.stderr.take().ok_or("helper-unavailable: no stderr")?;
    let pending: Pending = Arc::default();

    // Replies and progress events.
    let reader_pending = pending.clone();
    let handle = app.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => dispatch(&handle, &reader_pending, line.trim()),
            }
        }
        // The helper has gone: nobody waiting on it should hang.
        let waiting: Vec<_> = reader_pending.lock().unwrap().drain().collect();
        for (_, tx) in waiting {
            let _ = tx.send(Err("helper-exited".into()));
        }
        log_line("helper exited");
        let mut slot = running().lock().unwrap();
        if slot.as_mut().is_some_and(|r| r.child.try_wait().map(|s| s.is_some()).unwrap_or(true)) {
            *slot = None;
        }
    });

    // Diagnostics, to the log.
    std::thread::spawn(move || {
        let mut text = String::new();
        let mut reader = BufReader::new(stderr);
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            text.push_str(&String::from_utf8_lossy(&buf[..n]));
            while let Some(i) = text.find('\n') {
                let l: String = text.drain(..=i).collect();
                log_line(l.trim_end());
            }
        }
    });

    Ok(Running { child, stdin, pending })
}

fn dispatch(app: &AppHandle, pending: &Pending, line: &str) {
    if line.is_empty() {
        return;
    }
    let Ok(msg) = serde_json::from_str::<Value>(line) else {
        log_line(&format!("unreadable message from helper: {}", line.chars().take(200).collect::<String>()));
        return;
    };
    if let Some(event) = msg.get("event").and_then(Value::as_str) {
        // `lexical:run-progress` → `lexical-run-progress`, the style of
        // Magnolia's other events.
        let name = event.replace(':', "-");
        let _ = app.emit(&name, msg.get("payload").cloned().unwrap_or(Value::Null));
        return;
    }
    let Some(id) = msg.get("id").and_then(Value::as_u64) else { return };
    let Some(tx) = pending.lock().unwrap().remove(&id) else { return };
    let reply = if msg.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(msg.get("result").cloned().unwrap_or(Value::Null))
    } else {
        Err(msg
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("helper-error")
            .to_string())
    };
    let _ = tx.send(reply);
}

/// Sends a request and waits for its answer without blocking the async
/// runtime: an analysis may take minutes, and a Cancel must get through.
pub async fn request(app: &AppHandle, method: &str, params: Value) -> Reply {
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = mpsc::channel();
    {
        let mut slot = running().lock().unwrap();
        let alive = slot
            .as_mut()
            .is_some_and(|r| matches!(r.child.try_wait(), Ok(None)));
        if !alive {
            *slot = Some(start(app)?);
        }
        let r = slot.as_mut().unwrap();
        r.pending.lock().unwrap().insert(id, tx);
        let line = json!({ "id": id, "method": method, "params": params }).to_string();
        if let Err(e) = writeln!(r.stdin, "{line}").and_then(|_| r.stdin.flush()) {
            r.pending.lock().unwrap().remove(&id);
            *slot = None;
            return Err(format!("helper-exited: {e}"));
        }
    }
    tauri::async_runtime::spawn_blocking(move || rx.recv().unwrap_or(Err("helper-exited".into())))
        .await
        .unwrap_or_else(|e| Err(e.to_string()))
}

/// Stops the helper and every process it started (R included). Called when
/// the app quits, so no Rscript is left running in the background.
pub fn shutdown() {
    let Some(mut r) = running().lock().unwrap().take() else { return };
    let pid = r.child.id();
    #[cfg(windows)]
    {
        let mut kill = Command::new("taskkill");
        kill.args(["/PID", &pid.to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null());
        hide_window(&mut kill);
        let _ = kill.status();
    }
    let _ = r.child.kill();
    let _ = r.child.wait();
}

/// For the interface's first contact and for diagnosing an installation:
/// starts the helper if needed and returns its Node version and folders.
#[tauri::command]
pub async fn labiia_helper_ping(app: AppHandle) -> Result<Value, String> {
    request(&app, "ping", Value::Null).await
}
