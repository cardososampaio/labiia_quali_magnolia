//! Codebooks written in ordinary documents (labiia_quali): Word (.docx),
//! OpenDocument (.odt), Rich Text (.rtf) and Markdown (.md).
//!
//! Each reader returns the document's paragraphs with the marks that can
//! carry a codebook's hierarchy: heading level, whether the whole line is
//! bold, and list level. The interface turns these paragraphs into
//! categories and codes (src/renderer/utils/codebook-outline.ts) and lets
//! the researcher switch the reading rule in a preview, without reading the
//! file again. The rules are the ones labiia_quali's Electron build used, so
//! the same document gives the same codebook.
//!
//! The old binary Word format (.doc) is converted to .docx by the app before
//! it reaches here (src-tauri/src/labiia/codebook.rs).

mod docx;
mod md;
mod odt;
mod rtf;

use serde::Serialize;

pub use docx::read_docx;
pub use md::read_markdown;
pub use odt::read_odt;
pub use rtf::read_rtf;

/// One paragraph of a codebook document.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineParagraph {
    pub text: String,
    /// 1–9 for a heading, from its style or Markdown `#`.
    pub heading_level: Option<i64>,
    /// The paragraph uses the document's Title style.
    pub is_title: bool,
    /// Every visible character of the line is bold.
    pub bold: bool,
    /// 1 for a top-level list item, 2 for one nested inside it, and so on.
    pub list_level: Option<i64>,
}

/// What kind of document a file is, from its first bytes: documents are
/// often renamed (an .rtf saved as .doc, a .docx as .doc).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentKind {
    Rtf,
    Docx,
    Odt,
    /// The old Word format, which must be converted to .docx first.
    Doc,
    Markdown,
    Unsupported,
}

pub fn detect(data: &[u8], extension: &str) -> DocumentKind {
    if data.starts_with(b"{\\rtf") {
        return DocumentKind::Rtf;
    }
    if data.starts_with(b"PK") {
        let head = &data[..data.len().min(4096)];
        let is_odt = head.windows(b"opendocument".len()).any(|w| w == b"opendocument");
        return if is_odt { DocumentKind::Odt } else { DocumentKind::Docx };
    }
    // The old Word format starts with the OLE compound-file signature.
    if data.starts_with(&[0xd0, 0xcf, 0x11, 0xe0]) {
        return DocumentKind::Doc;
    }
    match extension.to_ascii_lowercase().as_str() {
        "md" | "markdown" | "txt" => DocumentKind::Markdown,
        _ => DocumentKind::Unsupported,
    }
}

/// Reads a document whose kind is not `Doc` or `Unsupported`.
pub fn read_document(data: &[u8], kind: DocumentKind) -> Result<Vec<OutlineParagraph>, String> {
    match kind {
        DocumentKind::Rtf => Ok(read_rtf(&latin1(data))),
        DocumentKind::Docx => read_docx(data),
        DocumentKind::Odt => read_odt(data),
        DocumentKind::Markdown => {
            let text = String::from_utf8_lossy(data);
            Ok(read_markdown(text.strip_prefix('\u{feff}').unwrap_or(&text)))
        }
        DocumentKind::Doc | DocumentKind::Unsupported => Err("unsupported-document".into()),
    }
}

/// Bytes as Latin-1 characters, one per byte (RTF is 7-bit text whose
/// other characters are escaped).
fn latin1(data: &[u8]) -> String {
    data.iter().map(|&b| b as char).collect()
}

// ── Shared by the readers ──

/// JavaScript's `\s`: Unicode white space plus the byte-order mark.
pub(crate) fn is_space(c: char) -> bool {
    c.is_whitespace() || c == '\u{feff}'
}

/// Runs of white space become one space; the ends are trimmed.
pub(crate) fn collapse(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut pending_space = false;
    for c in text.chars() {
        if is_space(c) {
            pending_space = !out.is_empty();
        } else {
            if pending_space {
                out.push(' ');
                pending_space = false;
            }
            out.push(c);
        }
    }
    out
}

/// Characters a reader sees: everything but white space.
pub(crate) fn visible_len(piece: &str) -> usize {
    piece.chars().filter(|&c| !is_space(c)).map(char::len_utf16).sum()
}

/// "Heading 2" / "Título 2" (any case, space optional) → 2.
pub(crate) fn heading_by_name(name: &str) -> Option<i64> {
    let lower = name.trim().to_lowercase();
    let rest = lower
        .strip_prefix("heading")
        .or_else(|| lower.strip_prefix("título"))
        .or_else(|| lower.strip_prefix("titulo"))?;
    let rest = rest.trim_start_matches(is_space);
    let mut chars = rest.chars();
    let d = chars.next()?.to_digit(10)?;
    chars.next().is_none().then_some(d as i64)
}

/// The document's Title style ("Title" / "Título").
pub(crate) fn is_title_name(name: &str) -> bool {
    matches!(name.trim().to_lowercase().as_str(), "title" | "título" | "titulo")
}

/// A paragraph before its list level is known.
#[derive(Debug, Clone)]
pub(crate) struct ListParagraph {
    pub para: OutlineParagraph,
    pub in_list: bool,
    /// The list's own level, 0-based (NaN when the file gives no number).
    pub ilvl: f64,
    /// Left indent in twips, when known.
    pub indent: Option<f64>,
}

/// List level = rank of the paragraph's indent among the list indents used
/// in the document (indents within a quarter centimetre count as one), or
/// the list's own level when no indent is known. The visible indent is what
/// the reader sees: Word's "List Number 2" style is level 0 of its own list,
/// only indented further.
pub(crate) fn list_levels_from_indents(raw: Vec<ListParagraph>) -> Vec<OutlineParagraph> {
    let mut indents: Vec<f64> = raw
        .iter()
        .filter(|r| r.in_list)
        .filter_map(|r| r.indent)
        .collect();
    indents.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    indents.dedup();
    let mut steps: Vec<f64> = Vec::new();
    for v in indents {
        if steps.last().is_none_or(|&last| v - last > 140.0) {
            steps.push(v);
        }
    }
    raw.into_iter()
        .map(|r| {
            let mut p = r.para;
            if r.in_list {
                let rank = r
                    .indent
                    .map(|i| steps.iter().filter(|&&st| st <= i + 140.0).count())
                    .unwrap_or(0);
                p.list_level = if rank > 0 {
                    Some(rank as i64)
                } else {
                    let l = r.ilvl + 1.0;
                    l.is_finite().then_some(l as i64)
                };
            }
            p
        })
        .collect()
}

/// `Number(text)` for attribute values: NaN when not a number.
pub(crate) fn js_number(s: &str) -> f64 {
    let t = s.trim();
    if t.is_empty() {
        return 0.0;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// Reads one entry of a zip held in memory as text.
pub(crate) fn zip_text(data: &[u8], name: &str) -> Option<String> {
    use std::io::Read;
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(data)).ok()?;
    let mut entry = zip.by_name(name).ok()?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}
