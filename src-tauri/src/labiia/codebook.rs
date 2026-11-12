//! Importing a codebook from a .qdc file or from a document (Word, the old
//! Word format, OpenDocument, RTF, Markdown).
//!
//! A .qdc gives codes directly. A document gives its paragraphs, which the
//! interface shows in a preview where the researcher picks how its headings,
//! bold lines or numbering become categories and codes.

use magnolia_core::qdpx::codebook;
use magnolia_core::qdpx::codebook_outline::{DocumentKind, detect, read_document};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::i18n::t;

const DOCUMENT_EXTENSIONS: &[&str] = &["docx", "doc", "odt", "rtf", "md", "markdown"];

/// How long Word or LibreOffice may take to convert one .doc.
const CONVERT_TIMEOUT: Duration = Duration::from_secs(120);

fn error(message: String) -> Value {
    json!({ "kind": "error", "message": message })
}

/// The system refuses to open the file. On Windows that is usually an
/// antivirus guarding the Desktop or Documents; on a Mac, the privacy
/// setting that lets each program reach those folders. The message says
/// what to do about it.
fn read_error(e: &std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::PermissionDenied {
        t(if cfg!(target_os = "macos") { "labiia.macPrivacyBlocked" } else { "labiia.antivirusBlocked" })
    } else {
        e.to_string()
    }
}

#[cfg(windows)]
fn hidden(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000)
}
#[cfg(not(windows))]
fn hidden(cmd: &mut Command) -> &mut Command {
    cmd
}

/// Runs a converter, stopping it if it hangs (Word waiting on a hidden
/// dialog, say).
fn run(cmd: &mut Command) -> bool {
    let Ok(mut child) = hidden(cmd).spawn() else { return false };
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if start.elapsed() < CONVERT_TIMEOUT => std::thread::sleep(Duration::from_millis(200)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

// Word's own converter, through its automation interface. Paths travel in
// environment variables so no quoting can break the script.
const WORD_SCRIPT: &str = "$ErrorActionPreference = \"Stop\"; $w = New-Object -ComObject Word.Application; \
$w.Visible = $false; $w.DisplayAlerts = 0; try {   $d = $w.Documents.Open($env:LABIIA_IN, $false, $true, $false);   \
$d.SaveAs2($env:LABIIA_OUT, 16);   $d.Close($false) } finally { $w.Quit() }";

/// Where LibreOffice's converter may be: its Windows installer's folder, the
/// Mac app in Applications (system-wide or the user's own), Homebrew, and
/// the folders on PATH.
pub(crate) fn soffice_candidates() -> Vec<PathBuf> {
    let mut c: Vec<PathBuf> = ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"]
        .iter()
        .filter_map(|v| std::env::var_os(v))
        .map(|root| PathBuf::from(root).join("LibreOffice/program/soffice.exe"))
        .collect();
    if cfg!(target_os = "macos") {
        c.push(PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice"));
        if let Some(home) = std::env::var_os("HOME") {
            c.push(PathBuf::from(home).join("Applications/LibreOffice.app/Contents/MacOS/soffice"));
        }
        c.push(PathBuf::from("/opt/homebrew/bin/soffice"));
    }
    if let Some(path) = std::env::var_os("PATH") {
        let name = if cfg!(windows) { "soffice.exe" } else { "soffice" };
        c.extend(std::env::split_paths(&path).map(|d| d.join(name)));
    }
    c
}

pub(crate) fn soffice() -> Option<PathBuf> {
    soffice_candidates().into_iter().find(|p| p.is_file())
}

/// The old Word format is closed and binary: Word converts it to .docx, or
/// LibreOffice when Word is not installed.
fn convert_doc(path: &Path) -> Option<Vec<u8>> {
    let dir = std::env::temp_dir().join(format!("labiia-codebook-{}", magnolia_core::util::new_guid()));
    std::fs::create_dir_all(&dir).ok()?;
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "codebook".into());
    let out = dir.join(format!("{stem}.docx"));
    let result = (|| {
        if cfg!(windows)
            && run(Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WORD_SCRIPT])
                .env("LABIIA_IN", path)
                .env("LABIIA_OUT", &out))
            && out.exists()
        {
            return std::fs::read(&out).ok();
        }
        let soffice = soffice()?;
        run(Command::new(soffice)
            .args(["--headless", "--norestore", "--convert-to", "docx", "--outdir"])
            .arg(&dir)
            .arg(path));
        let produced = std::fs::read_dir(&dir)
            .ok()?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .find(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("docx")))?;
        std::fs::read(produced).ok()
    })();
    let _ = std::fs::remove_dir_all(&dir);
    result
}

/// Reads the chosen file into `{kind: "codes" | "outline" | "error"}`.
pub fn read_codebook_file(path: &Path) -> Value {
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(e) => return error(read_error(&e)),
    };
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if ext == "qdc" {
        return match codebook::deserialize_codebook(&String::from_utf8_lossy(&data)) {
            Ok(codes) => json!({ "kind": "codes", "codes": codes }),
            Err(e) => error(e),
        };
    }
    let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let (data, kind) = match detect(&data, &ext) {
        DocumentKind::Doc => match convert_doc(path) {
            Some(docx) => (docx, DocumentKind::Docx),
            None => return error(t("labiia.docNotConverted")),
        },
        DocumentKind::Unsupported => return error(t("labiia.notACodebookDocument")),
        k => (data, k),
    };
    match read_document(&data, kind) {
        Ok(paragraphs) => json!({ "kind": "outline", "fileName": file_name, "paragraphs": paragraphs }),
        Err(e) => error(e),
    }
}

/// Asks for a codebook file. `null` when the dialog is cancelled.
#[tauri::command]
pub async fn labiia_import_codebook(app: AppHandle, window: WebviewWindow) -> Result<Value, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_title(t("dialog.importCodebook"))
        .set_parent(&window)
        .add_filter(t("labiia.codebookFiles"), &[&["qdc"], DOCUMENT_EXTENSIONS].concat())
        .add_filter(t("dialog.qdcCodebook"), &["qdc"])
        .blocking_pick_file()
        .and_then(|p| p.into_path().ok())
    else {
        return Ok(Value::Null);
    };
    Ok(tauri::async_runtime::spawn_blocking(move || read_codebook_file(&path))
        .await
        .unwrap_or_else(|e| error(e.to_string())))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An old Word file becomes the same paragraphs the Electron build read
    /// from it. Needs Word or LibreOffice; without them it only checks that
    /// the failure is explained.
    #[test]
    fn an_old_word_file_reads_like_the_electron_build() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test/fixtures/codebooks/word");
        let got = read_codebook_file(&base.join("titulos.doc"));
        if got["kind"] == "error" {
            eprintln!("no Word or LibreOffice to convert .doc: {}", got["message"]);
            return;
        }
        let want: Value =
            serde_json::from_str(&std::fs::read_to_string(base.join("titulos.doc.expected.json")).unwrap()).unwrap();
        assert_eq!(got["kind"], "outline");
        assert_eq!(got["fileName"], "titulos.doc");
        assert_eq!(got["paragraphs"], want);
    }

    #[test]
    fn a_qdc_file_gives_codes() {
        let dir = std::env::temp_dir().join(format!("labiia-qdc-{}", magnolia_core::util::new_guid()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("book.qdc");
        let codes = vec![json!({ "guid": "11111111-1111-4111-8111-111111111111", "name": "Tema", "isCodable": true, "children": [] })];
        std::fs::write(&path, codebook::serialize_codebook(&codes, "0.0.0")).unwrap();
        let got = read_codebook_file(&path);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(got["kind"], "codes");
        assert_eq!(got["codes"][0]["name"], "Tema");
    }
}
