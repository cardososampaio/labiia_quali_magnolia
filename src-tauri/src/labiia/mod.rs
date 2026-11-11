//! What makes this build labiia_quali rather than Magnolia: its data folder,
//! the Node helper that runs the lexical analyses, and the commands the
//! interface uses for them.
//!
//! Kept in a module of its own so a new Magnolia release merges with few
//! conflicts: Magnolia's files only call into here.

pub mod codebook;
pub mod helper;
pub mod lexical;
pub mod terms;

use std::path::PathBuf;

/// The user-data folder's name under `%APPDATA%`, the one labiia_quali's
/// Electron build used, so a researcher's preferences, recent projects and
/// chosen Rscript carry over.
pub const DATA_FOLDER: &str = "labiia_quali";

/// Automatic updates stay off until labiia_quali publishes signed update
/// manifests of its own; checking Magnolia's would offer to replace
/// labiia_quali with Magnolia. The interface has the same switch in
/// `src/renderer/labiia/config.ts`.
pub const UPDATES_ENABLED: bool = false;

/// `LABIIA_DATA_DIR` replaces the user-data folder, so development and test
/// runs keep their preferences and recent projects apart from the
/// researcher's own (Magnolia rewrites the whole preferences file on save).
pub fn data_dir_override() -> Option<PathBuf> {
    std::env::var_os("LABIIA_DATA_DIR")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}
