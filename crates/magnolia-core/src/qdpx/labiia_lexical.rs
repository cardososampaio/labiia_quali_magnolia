//! Files of saved lexical analyses (labiia_quali) inside the project file.
//!
//! In memory a saved lexical analysis carries its result files (figures,
//! tables) as base64 in `config.result.files[].data`. In the .qdpx each file
//! is its own entry, `labiia-lexical/<analysis guid>/<file name>`, and
//! `magnolia-analyses.json` keeps only a reference (`path`), so the JSON
//! stays small and a reopened project shows its results without running the
//! tests again. Same layout as labiia_quali's Electron build, so projects
//! open in either version.

use super::archive::Archive;
use super::archive_write::AtomicZip;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::Value;
use std::path::Path;

pub const FOLDER: &str = "labiia-lexical";

fn is_lexical(a: &Value) -> bool {
    a.get("toolType")
        .and_then(Value::as_str)
        .is_some_and(|t| t.starts_with("lexical-"))
}

/// Analysis ids become folder names: letters, digits, `_` and `-` only.
fn safe_guid(g: &str) -> bool {
    !g.is_empty() && g.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

/// File names come from the tests; anything but a plain name is refused, so
/// a name can never point outside the analysis's own folder.
fn safe_name(n: &str) -> bool {
    (1..=120).contains(&n.chars().count())
        && !n.starts_with('.')
        && n.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

/// A copy of the analyses for writing: each result file becomes a zip entry
/// and the JSON keeps its `path`. A file that arrives with only a path (its
/// bytes were never loaded) is copied from the project on disk, so saving
/// never loses a result. Files with an unsafe name are left out, as before.
pub fn pack(analyses: &Value, zip: &mut AtomicZip, previous: &Path) -> std::io::Result<Value> {
    let mut out = analyses.clone();
    let Some(list) = out.as_array_mut() else { return Ok(out) };
    let mut prev: Option<Archive> = None;
    for a in list.iter_mut() {
        if !is_lexical(a) {
            continue;
        }
        let guid = a.get("guid").and_then(Value::as_str).unwrap_or("").to_string();
        if !safe_guid(&guid) {
            continue;
        }
        let Some(files) = a
            .pointer_mut("/config/result/files")
            .and_then(Value::as_array_mut)
        else {
            continue;
        };
        let mut packed = Vec::with_capacity(files.len());
        for f in files.iter() {
            let Some(name) = f.get("name").and_then(Value::as_str).filter(|n| safe_name(n)) else {
                continue;
            };
            let path = format!("{FOLDER}/{guid}/{name}");
            let bytes = match f.get("data").and_then(Value::as_str) {
                Some(b64) => match STANDARD.decode(b64.as_bytes()) {
                    Ok(b) => Some(b),
                    Err(_) => continue,
                },
                None => {
                    let old = f.get("path").and_then(Value::as_str).filter(|p| p.starts_with(FOLDER));
                    match old {
                        Some(old) => {
                            if prev.is_none() {
                                prev = Archive::open(previous).ok();
                            }
                            prev.as_mut().and_then(|p| p.read(old))
                        }
                        None => None,
                    }
                }
            };
            let Some(bytes) = bytes else { continue };
            zip.add(&path, &bytes)?;
            let mut entry = f.clone();
            if let Some(o) = entry.as_object_mut() {
                o.remove("data");
                o.insert("name".into(), name.into());
                o.insert("path".into(), path.into());
            }
            packed.push(entry);
        }
        *files = packed;
    }
    Ok(out)
}

/// Reads result files back from the project into the analyses, in place.
pub fn unpack(analyses: &mut Value, zip: &mut Archive) {
    let Some(list) = analyses.as_array_mut() else { return };
    for a in list.iter_mut() {
        if !is_lexical(a) {
            continue;
        }
        let Some(files) = a
            .pointer_mut("/config/result/files")
            .and_then(Value::as_array_mut)
        else {
            continue;
        };
        for f in files.iter_mut() {
            let Some(path) = f
                .get("path")
                .and_then(Value::as_str)
                .filter(|p| p.starts_with(&format!("{FOLDER}/")))
                .map(str::to_string)
            else {
                continue;
            };
            if let Some(bytes) = zip.read(&path) {
                f["data"] = STANDARD.encode(bytes).into();
            }
        }
    }
}
