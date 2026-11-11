//! Rich Text Format (.rtf) codebooks: heading level (the style's
//! `\outlinelevel`), whole-line bold (`\b` on the visible text), and list
//! membership with its indent (`\ls`, `\ilvl`, `\li`). Word and LibreOffice
//! write a style's formatting out on the text itself, so bold is read from
//! the text, not from the style sheet. Paragraphs in tables (`\intbl`) are
//! skipped, as in the Word reader.

use super::{
    ListParagraph, OutlineParagraph, collapse, heading_by_name, is_title_name, list_levels_from_indents,
    visible_len,
};
use std::collections::HashMap;

/// Groups whose text is not part of the document body.
const SKIP_DESTINATIONS: &[&str] = &[
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "headerl", "headerr", "headerf",
    "footer", "footerl", "footerr", "footerf", "listtable", "listoverridetable", "listtext", "pntext",
    "pntxta", "pntxtb", "fldinst", "themedata", "colorschememapping", "latentstyles", "datastore",
    "xmlnstbl", "rsidtbl", "generator", "footnote", "annotation", "object", "shp", "nonshppict", "revtbl",
];

enum Token {
    Open,
    Close,
    /// A control word with its numeric parameter (NaN for a bare "-").
    Word(String, Option<f64>),
    /// A control symbol; for `\'` the two hex digits follow.
    Symbol(char, String),
    Text(String),
}

fn tokens(rtf: &str) -> Vec<Token> {
    let c: Vec<char> = rtf.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < c.len() {
        match c[i] {
            '{' => {
                out.push(Token::Open);
                i += 1;
            }
            '}' => {
                out.push(Token::Close);
                i += 1;
            }
            '\\' => {
                let next = c.get(i + 1).copied();
                if next.is_some_and(|n| n.is_ascii_alphabetic()) {
                    let mut j = i + 1;
                    while j < c.len() && c[j].is_ascii_alphabetic() {
                        j += 1;
                    }
                    let word: String = c[i + 1..j].iter().collect();
                    let mut k = j;
                    if c.get(k).is_some_and(|&x| x == '-' || x.is_ascii_digit()) {
                        k += 1;
                        while c.get(k).is_some_and(|x| x.is_ascii_digit()) {
                            k += 1;
                        }
                    }
                    let param = (k > j).then(|| c[j..k].iter().collect::<String>().parse::<f64>().unwrap_or(f64::NAN));
                    if c.get(k) == Some(&' ') {
                        k += 1;
                    }
                    out.push(Token::Word(word, param));
                    i = k;
                } else if next == Some('\'') {
                    let hex: String = c[(i + 2).min(c.len())..(i + 4).min(c.len())].iter().collect();
                    out.push(Token::Symbol('\'', hex));
                    i += 4;
                } else {
                    if let Some(n) = next {
                        out.push(Token::Symbol(n, String::new()));
                    }
                    i += 2;
                }
            }
            '\r' | '\n' => i += 1,
            _ => {
                let mut j = i;
                while j < c.len() && !matches!(c[j], '{' | '}' | '\\' | '\r' | '\n') {
                    j += 1;
                }
                out.push(Token::Text(c[i..j].iter().collect()));
                i = j;
            }
        }
    }
    out
}

#[derive(Clone, Copy)]
struct GroupState {
    bold: bool,
    skip: bool,
    uc_skip: usize,
    in_style_sheet: bool,
}

#[derive(Default)]
struct StyleDef {
    name: String,
    outline_level: Option<f64>,
    based_on: Option<f64>,
}

#[derive(Default)]
struct StyleEntry {
    num: Option<f64>,
    outline: Option<f64>,
    based_on: Option<f64>,
    name: String,
}

#[derive(Clone)]
struct Para {
    style: f64,
    outline_level: Option<f64>,
    ls: f64,
    ilvl: f64,
    li: Option<f64>,
    in_table: bool,
}

impl Default for Para {
    fn default() -> Self {
        Para { style: 0.0, outline_level: None, ls: 0.0, ilvl: 0.0, li: None, in_table: false }
    }
}

/// Style numbers as map keys (a stray `\s-` gives NaN, which still names one style).
fn key(n: f64) -> i64 {
    if n.is_nan() { i64::MIN } else { n as i64 }
}

fn cp1252(byte: u8) -> String {
    let buf = [byte];
    let (s, _, _) = encoding_rs::WINDOWS_1252.decode(&buf);
    s.into_owned()
}

struct Reader {
    styles: HashMap<i64, StyleDef>,
    state: GroupState,
    pending_skip: usize,
    text: String,
    /// A UTF-16 high surrogate waiting for its pair (`\u` writes one unit each).
    high: Option<u16>,
    visible: usize,
    bold_visible: usize,
    para: Para,
    style_entry: Option<StyleEntry>,
    out: Vec<ListParagraph>,
}

impl Reader {
    fn add_text(&mut self, piece: &str) {
        if self.state.skip || piece.is_empty() {
            return;
        }
        let mut piece = piece.to_string();
        if self.pending_skip > 0 {
            let n = piece.chars().count();
            let drop = self.pending_skip.min(n);
            piece = piece.chars().skip(drop).collect();
            self.pending_skip -= drop;
            if piece.is_empty() {
                return;
            }
        }
        if self.state.in_style_sheet {
            if let Some(e) = self.style_entry.as_mut() {
                e.name.push_str(&piece);
            }
            return;
        }
        let v = visible_len(&piece);
        self.text.push_str(&piece);
        self.visible += v;
        if self.state.bold {
            self.bold_visible += v;
        }
    }

    fn style_outline(&self, num: f64) -> Option<f64> {
        let mut n = Some(num);
        for _ in 0..10 {
            let s = self.styles.get(&key(n?))?;
            if s.outline_level.is_some() {
                return s.outline_level;
            }
            n = s.based_on;
        }
        None
    }

    fn end_paragraph(&mut self) {
        let clean = collapse(&self.text);
        if !clean.is_empty() && !self.para.in_table {
            let name = self.styles.get(&key(self.para.style)).map(|s| s.name.clone()).unwrap_or_default();
            // LibreOffice names heading styles without writing \outlinelevel.
            let outline = self
                .para
                .outline_level
                .or_else(|| self.style_outline(self.para.style))
                .or_else(|| heading_by_name(&name).map(|l| (l - 1) as f64));
            self.out.push(ListParagraph {
                para: OutlineParagraph {
                    text: clean,
                    heading_level: outline.filter(|o| (0.0..9.0).contains(o)).map(|o| o as i64 + 1),
                    is_title: is_title_name(&name),
                    bold: self.visible > 0 && self.bold_visible == self.visible,
                    list_level: None,
                },
                in_list: self.para.ls > 0.0,
                ilvl: self.para.ilvl,
                indent: self.para.li,
            });
        }
        self.text.clear();
        self.visible = 0;
        self.bold_visible = 0;
    }

    fn add_unit(&mut self, unit: u16) {
        let s = match (self.high.take(), unit) {
            (None, 0xD800..=0xDBFF) => {
                self.high = Some(unit);
                return;
            }
            (Some(h), 0xDC00..=0xDFFF) => String::from_utf16_lossy(&[h, unit]),
            (_, u) => String::from_utf16_lossy(&[u]),
        };
        self.add_text(&s);
    }
}

pub fn read_rtf(rtf: &str) -> Vec<OutlineParagraph> {
    let mut r = Reader {
        styles: HashMap::new(),
        state: GroupState { bold: false, skip: false, uc_skip: 1, in_style_sheet: false },
        pending_skip: 0,
        text: String::new(),
        high: None,
        visible: 0,
        bold_visible: 0,
        para: Para::default(),
        style_entry: None,
        out: Vec::new(),
    };
    let mut stack: Vec<GroupState> = Vec::new();
    let mut style_depth: usize = usize::MAX;
    let mut group_start = false;
    let mut star_destination = false;

    for tok in tokens(rtf) {
        match tok {
            Token::Open => {
                stack.push(r.state);
                group_start = true;
                star_destination = false;
                continue;
            }
            Token::Close => {
                if r.state.in_style_sheet && r.style_entry.is_some() && stack.len() == style_depth {
                    let e = r.style_entry.take().unwrap();
                    // A style sheet entry's name ends with ";".
                    let t = e.name.trim_end_matches(super::is_space);
                    let name = t.strip_suffix(';').unwrap_or(&e.name).trim_matches(super::is_space).to_string();
                    if e.num.is_some() || !name.is_empty() {
                        r.styles.insert(
                            key(e.num.unwrap_or(0.0)),
                            StyleDef { name, outline_level: e.outline, based_on: e.based_on },
                        );
                    }
                }
                if let Some(s) = stack.pop() {
                    r.state = s;
                }
                group_start = false;
                r.pending_skip = 0;
                continue;
            }
            _ => {}
        }
        let was_group_start = group_start;
        group_start = false;
        match tok {
            Token::Symbol('*', _) => {
                star_destination = true;
                group_start = was_group_start;
            }
            Token::Symbol('\'', hex) => {
                if r.pending_skip > 0 {
                    r.pending_skip -= 1;
                } else {
                    let byte = u8::from_str_radix(&hex, 16).unwrap_or(0);
                    r.add_text(&cp1252(byte));
                }
            }
            Token::Symbol('~', _) => r.add_text(" "),
            Token::Symbol('_', _) => r.add_text("-"),
            Token::Symbol(c @ ('\\' | '{' | '}'), _) => r.add_text(&c.to_string()),
            Token::Symbol(..) => {}
            Token::Text(t) => r.add_text(&t),
            Token::Word(w, p) => {
                if was_group_start && (star_destination || SKIP_DESTINATIONS.contains(&w.as_str())) {
                    if w == "stylesheet" {
                        r.state.in_style_sheet = true;
                    } else {
                        r.state.skip = true;
                    }
                    continue;
                }
                if r.state.in_style_sheet {
                    if !stack.is_empty() && was_group_start && r.style_entry.is_none() {
                        r.style_entry = Some(StyleEntry::default());
                        style_depth = stack.len();
                    }
                    let Some(e) = r.style_entry.as_mut() else { continue };
                    match w.as_str() {
                        "s" => e.num = Some(p.unwrap_or(0.0)),
                        "cs" | "ds" | "ts" => e.num = Some(-1.0 - p.unwrap_or(0.0)),
                        "outlinelevel" => e.outline = p,
                        "sbasedon" => e.based_on = p,
                        _ => {}
                    }
                    continue;
                }
                match w.as_str() {
                    "par" => r.end_paragraph(),
                    "pard" => r.para = Para::default(),
                    "s" => r.para.style = p.unwrap_or(0.0),
                    "outlinelevel" => r.para.outline_level = p,
                    "ls" => r.para.ls = p.unwrap_or(0.0),
                    "ilvl" => r.para.ilvl = p.unwrap_or(0.0),
                    "li" | "lin" => r.para.li = p,
                    "intbl" => r.para.in_table = true,
                    "b" => r.state.bold = p != Some(0.0),
                    "plain" => r.state.bold = false,
                    "uc" => r.state.uc_skip = p.filter(|v| v.is_finite() && *v >= 0.0).map(|v| v as usize).unwrap_or(1),
                    "u" => {
                        if r.state.skip || r.state.in_style_sheet {
                            continue;
                        }
                        let v = p.unwrap_or(0.0);
                        let code = if v < 0.0 { v + 65536.0 } else { v };
                        r.add_unit(code as u16);
                        // The ANSI fallback written after \u is not text of its own.
                        r.pending_skip = r.state.uc_skip;
                    }
                    "tab" | "line" => r.add_text(" "),
                    "emdash" => r.add_text("—"),
                    "endash" => r.add_text("–"),
                    "lquote" | "rquote" => r.add_text("'"),
                    "ldblquote" | "rdblquote" => r.add_text("\""),
                    "bullet" => r.add_text("•"),
                    _ => {}
                }
            }
            Token::Open | Token::Close => unreachable!(),
        }
    }
    r.end_paragraph();
    list_levels_from_indents(r.out)
}
