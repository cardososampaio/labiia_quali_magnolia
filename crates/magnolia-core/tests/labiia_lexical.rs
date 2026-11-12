//! A saved lexical analysis (labiia_quali) must reopen with its figures and
//! tables: they are stored as their own entries in the project file, only a
//! reference stays in magnolia-analyses.json, and later saves keep them.

mod common;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use common::*;
use magnolia_core::qdpx::reader::read_qdpx;
use magnolia_core::qdpx::writer::{WriteOptions, write_qdpx};
use serde_json::{Map, Value, json};
use std::path::Path;

const PNG: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 1, 2, 3];

fn opts<'a>() -> WriteOptions<'a> {
    WriteOptions { app_version: APP_VERSION, editor_name: "", ..Default::default() }
}

fn project() -> Value {
    json!({
        "name": "Lex", "origin": "test", "users": [], "codes": [], "sources": [], "sets": [], "notes": [],
        "savedAnalyses": [
            { "guid": "ABC-1", "toolType": "lexical-wordcloud", "name": "Nuvem",
              "config": { "params": { "max_words": 100 }, "result": { "summary": { "words": 3 }, "files": [
                  { "name": "wordcloud.png", "mime": "image/png", "role": "image", "data": STANDARD.encode(PNG) },
                  { "name": "../fora.txt", "mime": "text/plain", "role": "data", "data": "eA==" }
              ] } } },
            { "guid": "XYZ", "toolType": "word-frequencies", "name": "Frequências", "config": { "wordCount": 30 } }
        ]
    })
}

fn analyses_json(path: &Path) -> Value {
    serde_json::from_slice(&zip_entry(path, "magnolia-analyses.json").unwrap()).unwrap()
}

#[test]
fn result_files_are_entries_and_the_json_keeps_references() {
    let d = temp();
    let path = p(&d, "lex.qdpx");
    write_qdpx(&path, &mut project(), &Map::new(), &opts()).unwrap();

    assert_eq!(zip_entry(&path, "labiia-lexical/ABC-1/wordcloud.png").unwrap(), PNG);
    let stored = analyses_json(&path);
    let files = stored[0]["config"]["result"]["files"].as_array().unwrap();
    // The unsafe name is refused: nothing can be written outside the analysis's folder.
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["path"], "labiia-lexical/ABC-1/wordcloud.png");
    assert!(files[0].get("data").is_none());
    // Other analyses are written as they are.
    assert_eq!(stored[1], project()["savedAnalyses"][1]);
}

#[test]
fn a_reopened_project_shows_the_saved_results() {
    let d = temp();
    let path = p(&d, "lex.qdpx");
    write_qdpx(&path, &mut project(), &Map::new(), &opts()).unwrap();
    let back = read_qdpx(&path, None).unwrap();
    let a = &back["savedAnalyses"][0];
    assert_eq!(a["config"]["result"]["files"][0]["data"], STANDARD.encode(PNG));
    assert_eq!(a["config"]["result"]["summary"], json!({ "words": 3 }));
}

#[test]
fn saving_again_keeps_the_results() {
    let d = temp();
    let path = p(&d, "lex.qdpx");
    write_qdpx(&path, &mut project(), &Map::new(), &opts()).unwrap();
    // Autosave writes what was read back...
    let mut reopened = read_qdpx(&path, None).unwrap();
    write_qdpx(&path, &mut reopened, &Map::new(), &opts()).unwrap();
    assert_eq!(zip_entry(&path, "labiia-lexical/ABC-1/wordcloud.png").unwrap(), PNG);
    // ...and a file that arrives with only its reference is carried from the file on disk.
    let mut by_reference = analyses_json(&path);
    let mut proj = project();
    proj["savedAnalyses"] = by_reference.take();
    write_qdpx(&path, &mut proj, &Map::new(), &opts()).unwrap();
    assert_eq!(zip_entry(&path, "labiia-lexical/ABC-1/wordcloud.png").unwrap(), PNG);
}

#[test]
fn save_as_takes_the_results_along() {
    let d = temp();
    let first = p(&d, "a.qdpx");
    let second = p(&d, "b.qdpx");
    write_qdpx(&first, &mut project(), &Map::new(), &opts()).unwrap();
    let mut proj = project();
    proj["savedAnalyses"] = analyses_json(&first);
    let o = WriteOptions { carry_forward_from: Some(&first), ..opts() };
    write_qdpx(&second, &mut proj, &Map::new(), &o).unwrap();
    assert_eq!(zip_entry(&second, "labiia-lexical/ABC-1/wordcloud.png").unwrap(), PNG);
}

#[test]
fn a_project_saved_by_the_electron_build_opens_with_its_results() {
    // labiia_quali 0.1.x wrote this layout with JSZip.
    let d = temp();
    let path = p(&d, "old.qdpx");
    let analyses = json!([{ "guid": "ABC-1", "toolType": "lexical-wordcloud", "name": "Nuvem",
        "config": { "result": { "files": [{ "name": "wordcloud.png", "mime": "image/png", "role": "image",
                                             "path": "labiia-lexical/ABC-1/wordcloud.png" }] } } }]);
    make_zip(
        &path,
        &[
            ("project.qde", b"<Project name=\"Old\"></Project>"),
            ("magnolia-analyses.json", analyses.to_string().as_bytes()),
            ("labiia-lexical/ABC-1/wordcloud.png", PNG),
        ],
    );
    let back = read_qdpx(&path, None).unwrap();
    assert_eq!(back["savedAnalyses"][0]["config"]["result"]["files"][0]["data"], STANDARD.encode(PNG));
}

/// The corpus preparation chosen for the lexical analyses travels with the
/// project: it is saved in its own entry and comes back when the project opens.
#[test]
fn the_corpus_preparation_is_saved_and_reopened_with_the_project() {
    let d = temp();
    let path = p(&d, "prep.qdpx");
    let prep = json!({ "enabled": true, "plurals": { "enabled": true, "excluded": ["slams"] },
        "equivalences": { "enabled": true, "pairs": [{ "from": "docente", "to": "professor" }] } });
    let mut proj = project();
    proj["labiiaCorpusPreparation"] = prep.clone();
    write_qdpx(&path, &mut proj, &Map::new(), &opts()).unwrap();
    assert!(zip_entry(&path, "labiia-lexical/preparacao.json").is_some());
    assert_eq!(read_qdpx(&path, None).unwrap()["labiiaCorpusPreparation"], prep);

    // A project without a preparation gets no entry and opens without one.
    let plain = p(&d, "plain.qdpx");
    write_qdpx(&plain, &mut project(), &Map::new(), &opts()).unwrap();
    assert!(zip_entry(&plain, "labiia-lexical/preparacao.json").is_none());
    assert!(read_qdpx(&plain, None).unwrap().get("labiiaCorpusPreparation").is_none());
}
