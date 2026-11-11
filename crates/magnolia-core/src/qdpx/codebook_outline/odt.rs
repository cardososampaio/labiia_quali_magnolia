//! OpenDocument text (.odt, from LibreOffice or a Google Docs export)
//! codebooks: heading level (`text:h`'s outline level), whole-line bold
//! (from paragraph and span styles) and the nesting depth of lists.

use super::{OutlineParagraph, collapse, is_title_name, js_number, visible_len, zip_text};
use roxmltree::{Document, Node};
use std::collections::HashMap;

/// `prefix:name` of an element, as the file writes it, for ODF's fixed prefixes.
fn qname(n: &Node) -> String {
    let local = n.tag_name().name();
    let prefix = match n.tag_name().namespace() {
        Some("urn:oasis:names:tc:opendocument:xmlns:text:1.0") => "text",
        Some("urn:oasis:names:tc:opendocument:xmlns:style:1.0") => "style",
        Some("urn:oasis:names:tc:opendocument:xmlns:office:1.0") => "office",
        _ => "",
    };
    format!("{prefix}:{local}")
}

/// An attribute by its local name, whatever its prefix.
fn attr<'a>(n: &Node<'a, '_>, name: &str) -> Option<&'a str> {
    n.attributes().find(|a| a.name() == name).map(|a| a.value())
}

struct OdtStyle {
    parent: Option<String>,
    bold: Option<bool>,
    display_name: String,
}

type Styles = HashMap<String, OdtStyle>;

fn collect_styles(node: Node, into: &mut Styles) {
    for n in node.children().filter(|c| c.is_element()) {
        match qname(&n).as_str() {
            "style:style" => {
                let Some(name) = attr(&n, "name") else { continue };
                let props = n
                    .children()
                    .find(|c| c.is_element() && c.tag_name().name() == "text-properties");
                let bold = props.and_then(|p| attr(&p, "font-weight")).map(|w| w == "bold" || js_number(w) >= 600.0);
                into.insert(
                    name.to_string(),
                    OdtStyle {
                        parent: attr(&n, "parent-style-name").map(str::to_string),
                        bold,
                        display_name: attr(&n, "display-name").unwrap_or(name).to_string(),
                    },
                );
            }
            "office:styles" | "office:automatic-styles" | "office:document-styles" | "office:document-content" => {
                collect_styles(n, into)
            }
            _ => {}
        }
    }
}

fn inherited<'s, T>(styles: &'s Styles, mut name: Option<&'s str>, pick: impl Fn(&OdtStyle) -> Option<T>) -> Option<T> {
    for _ in 0..10 {
        let Some(s) = name.and_then(|n| styles.get(n)) else { break };
        if let Some(v) = pick(s) {
            return Some(v);
        }
        name = s.parent.as_deref();
    }
    None
}

struct Acc {
    text: String,
    visible: usize,
    bold: usize,
}

fn read_text(node: Node, bold: bool, styles: &Styles, acc: &mut Acc) {
    for n in node.children() {
        if n.is_text() {
            let piece = n.text().unwrap_or("");
            let v = visible_len(piece);
            acc.text.push_str(piece);
            acc.visible += v;
            if bold {
                acc.bold += v;
            }
            continue;
        }
        if !n.is_element() {
            continue;
        }
        match qname(&n).as_str() {
            "text:s" => {
                let count = js_number(attr(&n, "c").unwrap_or("1"));
                if count.is_finite() && count > 0.0 {
                    acc.text.push_str(&" ".repeat(count as usize));
                }
            }
            "text:tab" | "text:line-break" => acc.text.push(' '),
            "text:span" | "text:a" => {
                let span_bold = inherited(styles, attr(&n, "style-name"), |s| s.bold);
                read_text(n, span_bold.unwrap_or(bold), styles, acc)
            }
            // Footnotes and comments are not part of the line.
            "text:note" | "office:annotation" => {}
            _ => read_text(n, bold, styles, acc),
        }
    }
}

fn walk(node: Node, depth: i64, styles: &Styles, out: &mut Vec<OutlineParagraph>) {
    for n in node.children().filter(|c| c.is_element()) {
        let q = qname(&n);
        match q.as_str() {
            "text:p" | "text:h" => {
                let style = attr(&n, "style-name");
                let mut acc = Acc { text: String::new(), visible: 0, bold: 0 };
                read_text(n, inherited(styles, style, |s| s.bold).unwrap_or(false), styles, &mut acc);
                let text = collapse(&acc.text);
                if text.is_empty() {
                    continue;
                }
                let heading_level = (q == "text:h").then(|| {
                    let l = js_number(attr(&n, "outline-level").unwrap_or("1"));
                    l.is_finite().then_some(l as i64)
                });
                let is_title = inherited(styles, style, |s| is_title_name(&s.display_name).then_some(())).is_some();
                out.push(OutlineParagraph {
                    text,
                    heading_level: heading_level.flatten(),
                    is_title,
                    bold: acc.visible > 0 && acc.bold == acc.visible,
                    list_level: (depth > 0).then_some(depth),
                });
            }
            "text:list" => walk(n, depth + 1, styles, out),
            "text:list-item" | "text:list-header" | "text:section" | "office:text" | "office:body"
            | "office:document-content" => walk(n, depth, styles, out),
            // Tables are skipped, as in the Word reader.
            _ => {}
        }
    }
}

pub fn read_odt(data: &[u8]) -> Result<Vec<OutlineParagraph>, String> {
    let content = zip_text(data, "content.xml").ok_or("content.xml not found")?;
    let mut styles = Styles::new();
    if let Some(xml) = zip_text(data, "styles.xml")
        && let Ok(doc) = Document::parse(&xml)
    {
        collect_styles(doc.root(), &mut styles);
    }
    let doc = Document::parse(&content).map_err(|e| e.to_string())?;
    collect_styles(doc.root(), &mut styles);
    let mut out = Vec::new();
    walk(doc.root(), 0, &styles, &mut out);
    Ok(out)
}
