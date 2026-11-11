//! A codebook written in a Word, OpenDocument, RTF or Markdown document
//! gives the same paragraphs, with the same heading, bold and list marks,
//! as labiia_quali's Electron build read from it, so the same document
//! becomes the same codebook. The expected paragraphs beside each sample
//! (`<file>.expected.json`) were written by that build.
//!
//! Old Word files (.doc) need Word or LibreOffice to convert them first;
//! that conversion is the app's and is tested there.

use magnolia_core::qdpx::codebook_outline::{DocumentKind, detect, read_document};
use serde_json::Value;
use std::path::{Path, PathBuf};

fn samples() -> Vec<PathBuf> {
    fn walk(d: &Path, out: &mut Vec<PathBuf>) {
        for e in std::fs::read_dir(d).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk(&p, out)
            } else if !p.to_string_lossy().ends_with(".json") {
                out.push(p)
            }
        }
    }
    let mut out = Vec::new();
    walk(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../test/fixtures/codebooks"), &mut out);
    out.sort();
    out
}

#[test]
fn every_sample_reads_as_the_electron_build_read_it() {
    let mut checked = 0;
    let mut failures = Vec::new();
    for path in samples() {
        let data = std::fs::read(&path).unwrap();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let kind = detect(&data, ext);
        if kind == DocumentKind::Doc {
            continue;
        }
        let got = serde_json::to_value(read_document(&data, kind).unwrap()).unwrap();
        let want: Value =
            serde_json::from_str(&std::fs::read_to_string(format!("{}.expected.json", path.display())).unwrap()).unwrap();
        if got != want {
            failures.push(format!("{}\n  got:  {got}\n  want: {want}", path.display()));
        }
        checked += 1;
    }
    assert!(checked >= 25, "only {checked} samples read");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn the_first_bytes_decide_the_format() {
    assert_eq!(detect(br"{\rtf1 x", "doc"), DocumentKind::Rtf);
    assert_eq!(detect(&[0xd0, 0xcf, 0x11, 0xe0, 0], "docx"), DocumentKind::Doc);
    assert_eq!(detect(b"# Livro", "md"), DocumentKind::Markdown);
    assert_eq!(detect(b"%PDF-1.7", "pdf"), DocumentKind::Unsupported);
}
