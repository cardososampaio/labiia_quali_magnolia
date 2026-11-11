//! Word (.docx) codebooks: the heading level of each paragraph's style
//! ("Heading 1" / "Título 1", or any style with an outline level), whether
//! the whole line is bold, and the level of a Word list.
//!
//! Paragraphs inside tables are skipped: a codebook laid out as a table is a
//! different shape from the outlines this importer reads.

use super::{
    ListParagraph, OutlineParagraph, collapse, heading_by_name, is_title_name, js_number,
    list_levels_from_indents, visible_len, zip_text,
};
use roxmltree::{Document, Node};
use std::collections::HashMap;

fn local<'a>(n: &Node<'a, '_>) -> &'a str {
    n.tag_name().name()
}

fn is(n: &Node, name: &str) -> bool {
    n.is_element() && local(n) == name
}

/// An attribute by its local name, whatever its prefix.
fn attr<'a>(n: &Node<'a, '_>, name: &str) -> Option<&'a str> {
    n.attributes().find(|a| a.name() == name).map(|a| a.value())
}

fn child<'a, 'i>(n: &Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    n.children().find(|c| is(c, name))
}

/// `w:b` present and not switched off with w:val="0"/"false"/"off".
fn is_on(n: Option<Node>) -> Option<bool> {
    let n = n?;
    Some(!matches!(attr(&n, "val"), Some("0" | "false" | "off")))
}

/// Left indent in twips from a `w:ind` element among a `w:pPr`'s children.
fn indent_of(p_pr: Option<Node>) -> Option<f64> {
    let ind = child(&p_pr?, "ind")?;
    attr(&ind, "left").or_else(|| attr(&ind, "start")).map(js_number)
}

#[derive(Default, Clone)]
struct Style {
    name: String,
    based_on: Option<String>,
    outline_level: Option<f64>,
    bold: Option<bool>,
    is_title: bool,
    num_id: Option<String>,
    ilvl: Option<f64>,
    indent: Option<f64>,
}

type Styles = HashMap<String, Style>;

fn read_styles(xml: Option<&str>) -> Styles {
    let mut styles = Styles::new();
    let Some(doc) = xml.and_then(|x| Document::parse(x).ok()) else { return styles };
    let root = doc.root_element();
    if local(&root) != "styles" {
        return styles;
    }
    for s in root.children().filter(|c| is(c, "style")) {
        let Some(id) = attr(&s, "styleId") else { continue };
        let name = child(&s, "name").and_then(|n| attr(&n, "val")).unwrap_or(id).to_string();
        let p_pr = child(&s, "pPr");
        let r_pr = child(&s, "rPr");
        let num_pr = p_pr.and_then(|p| child(&p, "numPr"));
        styles.insert(
            id.to_string(),
            Style {
                num_id: num_pr.and_then(|n| child(&n, "numId")).and_then(|n| attr(&n, "val")).map(str::to_string),
                ilvl: num_pr
                    .and_then(|n| child(&n, "ilvl"))
                    .map(|n| attr(&n, "val").map(js_number).unwrap_or(f64::NAN)),
                indent: indent_of(p_pr),
                based_on: child(&s, "basedOn").and_then(|n| attr(&n, "val")).map(str::to_string),
                outline_level: p_pr
                    .and_then(|p| child(&p, "outlineLvl"))
                    .map(|n| attr(&n, "val").map(js_number).unwrap_or(f64::NAN)),
                bold: r_pr.and_then(|r| is_on(child(&r, "b"))),
                is_title: is_title_name(&name),
                name,
            },
        );
    }
    styles
}

/// First value of `pick` along a style's "based on" chain.
fn inherited<'s, T>(styles: &'s Styles, mut id: Option<&'s str>, pick: impl Fn(&Style) -> Option<T>) -> Option<T> {
    for _ in 0..10 {
        let Some(s) = id.and_then(|i| styles.get(i)) else { break };
        if let Some(v) = pick(s) {
            return Some(v);
        }
        id = s.based_on.as_deref();
    }
    None
}

/// Heading level 1–9 of a paragraph style, following "based on" links.
fn heading_level<'s>(styles: &'s Styles, mut id: Option<&'s str>) -> Option<i64> {
    for _ in 0..10 {
        let Some(i) = id else { break };
        let Some(s) = styles.get(i) else { break };
        let by_id = {
            // "Heading1" as a style id, without the space.
            let lower = i.to_lowercase();
            ["heading", "título", "titulo"].iter().find_map(|p| {
                let rest = lower.strip_prefix(p)?;
                let mut c = rest.chars();
                let d = c.next()?.to_digit(10)?;
                c.next().is_none().then_some(d as i64)
            })
        };
        if let Some(l) = heading_by_name(&s.name).or(by_id) {
            return Some(l);
        }
        if let Some(o) = s.outline_level
            && (0.0..9.0).contains(&o)
        {
            return Some(o as i64 + 1);
        }
        id = s.based_on.as_deref();
    }
    None
}

fn style_bold<'s>(styles: &'s Styles, id: Option<&'s str>) -> bool {
    inherited(styles, id, |s| s.bold).unwrap_or(false)
}

/// numId → ilvl → left indent, from word/numbering.xml.
type Numbering = HashMap<String, HashMap<i64, f64>>;

fn read_numbering(xml: Option<&str>) -> Numbering {
    let mut out = Numbering::new();
    let Some(doc) = xml.and_then(|x| Document::parse(x).ok()) else { return out };
    let root = doc.root_element();
    if local(&root) != "numbering" {
        return out;
    }
    let mut abstracts: HashMap<String, HashMap<i64, f64>> = HashMap::new();
    let mut nums: Vec<(String, String)> = Vec::new();
    for n in root.children().filter(|c| c.is_element()) {
        if is(&n, "abstractNum") {
            let mut levels = HashMap::new();
            for lvl in n.children().filter(|c| is(c, "lvl")) {
                if let Some(indent) = indent_of(child(&lvl, "pPr")) {
                    levels.insert(js_number(attr(&lvl, "ilvl").unwrap_or("0")) as i64, indent);
                }
            }
            abstracts.insert(attr(&n, "abstractNumId").unwrap_or("").to_string(), levels);
        } else if is(&n, "num") {
            nums.push((
                attr(&n, "numId").unwrap_or("").to_string(),
                child(&n, "abstractNumId").and_then(|a| attr(&a, "val")).unwrap_or("").to_string(),
            ));
        }
    }
    for (num, abs) in nums {
        out.insert(num, abstracts.get(&abs).cloned().unwrap_or_default());
    }
    out
}

struct Acc {
    text: String,
    visible: usize,
    bold: usize,
}

fn walk_runs(nodes: Node, styles: &Styles, paragraph_bold: bool, acc: &mut Acc) {
    for n in nodes.children().filter(|c| c.is_element()) {
        match local(&n) {
            "r" => {
                let r_pr = child(&n, "rPr");
                // Bold set on the run wins; then a character style; then the paragraph style.
                let explicit = r_pr.and_then(|r| is_on(child(&r, "b")));
                let char_style = r_pr.and_then(|r| child(&r, "rStyle")).and_then(|s| attr(&s, "val"));
                let bold = match explicit {
                    Some(b) => b,
                    None => match char_style {
                        Some(cs) if styles.get(cs).is_some_and(|s| s.bold.is_some()) => style_bold(styles, Some(cs)),
                        _ => paragraph_bold,
                    },
                };
                for r in n.children().filter(|c| c.is_element()) {
                    let piece: String = match local(&r) {
                        "t" => r.children().filter_map(|c| c.text()).collect(),
                        "tab" => "\t".into(),
                        "br" | "cr" => " ".into(),
                        _ => String::new(),
                    };
                    let v = visible_len(&piece);
                    acc.text.push_str(&piece);
                    acc.visible += v;
                    if bold {
                        acc.bold += v;
                    }
                }
            }
            "hyperlink" | "ins" | "smartTag" | "sdt" | "sdtContent" | "fldSimple" => {
                walk_runs(n, styles, paragraph_bold, acc)
            }
            _ => {}
        }
    }
}

fn read_paragraph(p: Node, styles: &Styles, numbering: &Numbering) -> ListParagraph {
    let p_pr = child(&p, "pPr");
    let style_id = p_pr.and_then(|x| child(&x, "pStyle")).and_then(|s| attr(&s, "val"));
    let num_pr = p_pr.and_then(|x| child(&x, "numPr"));
    let num_id: Option<String> = num_pr
        .and_then(|n| child(&n, "numId"))
        .and_then(|n| attr(&n, "val"))
        .map(str::to_string)
        .or_else(|| inherited(styles, style_id, |s| s.num_id.clone()));
    let ilvl = match num_pr.and_then(|n| child(&n, "ilvl")) {
        Some(n) => js_number(attr(&n, "val").unwrap_or("0")),
        None => inherited(styles, style_id, |s| s.ilvl).unwrap_or(0.0),
    };
    let in_list = num_id.as_deref().is_some_and(|n| !n.is_empty() && n != "0");
    let indent = indent_of(p_pr)
        .or_else(|| inherited(styles, style_id, |s| s.indent))
        .or_else(|| {
            if !in_list || ilvl.is_nan() {
                return None;
            }
            numbering.get(num_id.as_deref()?)?.get(&(ilvl as i64)).copied()
        });
    let mut acc = Acc { text: String::new(), visible: 0, bold: 0 };
    walk_runs(p, styles, style_bold(styles, style_id), &mut acc);
    ListParagraph {
        para: OutlineParagraph {
            text: collapse(&acc.text),
            heading_level: heading_level(styles, style_id),
            is_title: style_id.and_then(|s| styles.get(s)).is_some_and(|s| s.is_title),
            bold: acc.visible > 0 && acc.bold == acc.visible,
            list_level: None,
        },
        in_list,
        ilvl,
        indent,
    }
}

pub fn read_docx(data: &[u8]) -> Result<Vec<OutlineParagraph>, String> {
    let document = zip_text(data, "word/document.xml").ok_or("word/document.xml not found")?;
    let styles = read_styles(zip_text(data, "word/styles.xml").as_deref());
    let numbering = read_numbering(zip_text(data, "word/numbering.xml").as_deref());
    let doc = Document::parse(&document).map_err(|e| e.to_string())?;
    let root = doc.root_element();
    let mut raw = Vec::new();
    if local(&root) == "document"
        && let Some(body) = child(&root, "body")
    {
        for p in body.children().filter(|c| is(c, "p")) {
            let para = read_paragraph(p, &styles, &numbering);
            if !para.para.text.is_empty() {
                raw.push(para);
            }
        }
    }
    Ok(list_levels_from_indents(raw))
}
