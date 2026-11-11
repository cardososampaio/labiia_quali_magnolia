//! Preferences carried over from labiia_quali 0.1.x.
//!
//! 0.1.x always saved `toolbarStyle: "icons"` while showing its ribbon (the
//! value meant something else there). In this build "icons" selects
//! Magnolia's compact toolbar, so a researcher coming from 0.1.x would lose
//! the ribbon. Preferences without the revision mark are therefore treated
//! as 0.1.x ones: the toolbar becomes the ribbon, once. Every save from this
//! build carries the mark, so a later choice of the compact toolbar sticks.

use serde_json::{Value, json};

const REVISION_KEY: &str = "labiiaPrefsRevision";
const REVISION: u64 = 1;

/// Converts 0.1.x preferences in place; true when something changed and the
/// file should be written back.
pub fn migrate(prefs: &mut Value) -> bool {
    let Some(map) = prefs.as_object_mut() else { return false };
    if map.get(REVISION_KEY).and_then(Value::as_u64).unwrap_or(0) >= REVISION {
        return false;
    }
    map.insert("toolbarStyle".into(), json!("ribbon"));
    map.insert(REVISION_KEY.into(), json!(REVISION));
    true
}

/// Marks preferences saved by this build (the interface saves a fixed list
/// of keys and would drop the mark).
pub fn stamp(prefs: &Value) -> Value {
    let mut out = prefs.clone();
    if let Some(map) = out.as_object_mut() {
        map.insert(REVISION_KEY.into(), json!(REVISION));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preferences_from_0_1_open_with_the_ribbon() {
        let mut p = json!({ "toolbarStyle": "icons", "theme": "windows" });
        assert!(migrate(&mut p));
        assert_eq!(p["toolbarStyle"], "ribbon");
        assert_eq!(p["theme"], "windows");
    }

    #[test]
    fn a_compact_toolbar_chosen_in_this_version_is_kept() {
        let mut p = stamp(&json!({ "toolbarStyle": "icons" }));
        assert!(!migrate(&mut p));
        assert_eq!(p["toolbarStyle"], "icons");
    }

    #[test]
    fn missing_preferences_are_left_alone() {
        let mut p = Value::Null;
        assert!(!migrate(&mut p));
    }
}
