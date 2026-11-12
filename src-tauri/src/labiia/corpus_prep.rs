//! Commands behind "Preparar corpus" (`window.api.lexical.prep*`): the
//! suggestions the researcher reviews, and the table of replacements a
//! lexical test sends to the engine. The work is in `labiia-prep`; here the
//! dictionaries are found in the program's resources and kept loaded, and
//! the work runs off the interface's thread.

use super::helper::lexical_resources;
use labiia_prep::lexique::Lexique;
use labiia_prep::table::{self, Choices};
use labiia_prep::text::Corpus;
use labiia_prep::{Lang, compounds, plural, variants};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::AppHandle;

type CmdResult<T> = Result<T, String>;

/// Dictionaries take a moment to read; each language is read once per session.
fn lexique(dir: &PathBuf, lang: Lang) -> CmdResult<Arc<Lexique>> {
    static CACHE: OnceLock<Mutex<HashMap<Lang, Arc<Lexique>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(l) = cache.lock().map_err(|e| e.to_string())?.get(&lang) {
        return Ok(l.clone());
    }
    let l = Arc::new(Lexique::load(dir, lang).map_err(|e| format!("dictionary-unavailable: {e}"))?);
    cache.lock().map_err(|e| e.to_string())?.insert(lang, l.clone());
    Ok(l)
}

fn setup(app: &AppHandle, language: &str) -> CmdResult<(PathBuf, Lang)> {
    let lang = Lang::parse(language).ok_or_else(|| format!("unknown-language: {language}"))?;
    let dir = lexical_resources(app)
        .ok_or("helper-unavailable: lexical resources not found")?
        .join("lexical");
    Ok((dir, lang))
}

/// Suggestions of one kind for the texts: "plurals", "variants" (with
/// `method`) or "compounds" (with `minFreq`).
#[tauri::command]
pub async fn corpus_prep_suggest(
    app: AppHandle,
    kind: String,
    language: String,
    texts: Vec<String>,
    options: Option<Value>,
) -> CmdResult<Value> {
    let (dir, lang) = setup(&app, &language)?;
    let opts = options.unwrap_or(Value::Null);
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<Value> {
        let corpus = Corpus::new(&texts);
        match kind.as_str() {
            "plurals" => {
                let lex = lexique(&dir, lang)?;
                Ok(json!(plural::suggest(&corpus.freq, &lex)))
            }
            "variants" => {
                let method: variants::Method = serde_json::from_value(opts.get("method").cloned().unwrap_or(json!("fingerprint")))
                    .map_err(|e| e.to_string())?;
                Ok(json!(variants::suggest(&corpus.freq, method)))
            }
            "compounds" => {
                let lex = lexique(&dir, lang)?;
                let min = opts.get("minFreq").and_then(Value::as_u64).unwrap_or(3) as u32;
                Ok(json!(compounds::suggest(&corpus, &lex, min)))
            }
            other => Err(format!("unknown-kind: {other}")),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The table of replacements for one run, from the saved choices and the
/// texts being analysed (plurals are found again in these texts).
#[tauri::command]
pub async fn corpus_prep_build(app: AppHandle, language: String, texts: Vec<String>, choices: Choices) -> CmdResult<Value> {
    let (dir, lang) = setup(&app, &language)?;
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<Value> {
        let corpus = Corpus::new(&texts);
        let lex = lexique(&dir, lang)?;
        Ok(json!(table::build(&choices, &corpus, &lex)))
    })
    .await
    .map_err(|e| e.to_string())?
}
