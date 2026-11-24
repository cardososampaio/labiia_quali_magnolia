//! History of the codes (labiia_quali) inside the project file.
//!
//! Every time a code is created, renamed, described, moved to another parent,
//! merged, deleted or imported, the interface records who did it, when, and
//! the values before and after. The record travels with the project so the
//! coding process can be reviewed and reported: it is saved in its own
//! entry, `labiia-codigos/historico.json`, which other REFI-QDA programs
//! ignore, and comes back when the project opens.

use super::archive::Archive;
use super::archive_write::AtomicZip;
use serde_json::Value;

pub const HISTORY_ENTRY: &str = "labiia-codigos/historico.json";
/// Where the interface keeps the history in the project it saves and opens.
pub const HISTORY_FIELD: &str = "labiiaCodeHistory";

/// Writes the history of the codes, when the project has one.
pub fn write_code_history(project: &Value, zip: &mut AtomicZip) -> std::io::Result<()> {
    match project.get(HISTORY_FIELD).filter(|v| v.is_object()) {
        Some(v) => zip.add(HISTORY_ENTRY, v.to_string().as_bytes()),
        None => Ok(()),
    }
}

/// Reads the history of the codes back into the project, when saved.
pub fn read_code_history(project: &mut Value, zip: &mut Archive) {
    let Some(v) = zip
        .read(HISTORY_ENTRY)
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .filter(Value::is_object)
    else {
        return;
    };
    if let Some(o) = project.as_object_mut() {
        o.insert(HISTORY_FIELD.into(), v);
    }
}
