//! Markdown (.md) codebooks: `#` headings give the heading level, a line
//! wrapped whole in **bold** (or __bold__) is bold, and list items ("1.",
//! "1)", "-", "*", "+") give the list level by their indentation. Numbered
//! items keep their number in the text, so the bold-number and numbering
//! rules can read it.

use super::{ListParagraph, OutlineParagraph, is_space, list_levels_from_indents};
use regex::Regex;
use std::sync::LazyLock;

static HEADING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$").unwrap());
static ORDERED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(\s*)([0-9]{1,3}[.)])\s+(.*)$").unwrap());
static BULLET: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(\s*)[-*+]\s+(.*)$").unwrap());
static SETEXT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s{0,3}(=+|-+)\s*$").unwrap());
static FENCE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*(```|~~~)").unwrap());
static RULE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*([-*_]\s*){3,}$").unwrap());
static TABLE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*\|").unwrap());
static QUOTE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*>\s?").unwrap());
static CODE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"`([^`]*)`").unwrap());
static LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"!?\[([^\]]*)\]\([^)]*\)").unwrap());
static ESCAPE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\\([\\`*_{}\[\]()#+\-.!])").unwrap());

fn trim_js(s: &str) -> &str {
    s.trim_matches(is_space)
}

/// `**text**` / `__text__` pairs anywhere in the line lose their markers.
fn strip_strong(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut p = 0;
    while p < c.len() {
        if p + 1 < c.len() && ((c[p] == '*' && c[p + 1] == '*') || (c[p] == '_' && c[p + 1] == '_')) {
            let m = c[p];
            // The shortest content of at least one character.
            let close = (p + 3..c.len().saturating_sub(1)).find(|&q| c[q] == m && c[q + 1] == m);
            if let Some(q) = close {
                out.extend(&c[p + 2..q]);
                p = q + 2;
                continue;
            }
        }
        out.push(c[p]);
        p += 1;
    }
    out
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// `*text*` / `_text_` emphasis loses its markers when it stands as a word.
fn strip_emphasis(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let n = c.len();
    // Where the closing marker of emphasis opening at `m` is, if any.
    let close_at = |m: usize| -> Option<usize> {
        if m >= n || !matches!(c[m], '*' | '_') || m + 1 >= n || is_space(c[m + 1]) {
            return None;
        }
        let ok = |e: usize| -> bool {
            e + 1 < n
                && !is_space(c[e])
                && matches!(c[e + 1], '*' | '_')
                && (e + 2 == n || (c[e + 2] != '*' && !is_word(c[e + 2])))
        };
        // Longer content is tried from two characters up, then one alone.
        (m + 2..n).find(|&e| ok(e)).or_else(|| ok(m + 1).then_some(m + 1))
    };
    let mut out = String::new();
    let mut p = 0;
    while p < n {
        // Start of the line, then a character that is not `*` or a word character.
        let found = (if p == 0 { close_at(0).map(|e| (None, 0, e)) } else { None }).or_else(|| {
            (c[p] != '*' && !is_word(c[p])).then(|| close_at(p + 1).map(|e| (Some(c[p]), p + 1, e))).flatten()
        });
        if let Some((lead, m, e)) = found {
            if let Some(l) = lead {
                out.push(l);
            }
            out.extend(&c[m + 1..=e]);
            p = e + 2;
        } else {
            out.push(c[p]);
            p += 1;
        }
    }
    out
}

/// Removes inline Markdown and reports whether the whole line was bold.
fn inline(text: &str) -> (String, bool) {
    let mut t = trim_js(text).to_string();
    let chars: Vec<char> = t.chars().collect();
    let whole = chars.len() >= 5
        && [['*', '*'], ['_', '_']].iter().any(|m| chars[..2] == m[..] && chars[chars.len() - 2..] == m[..]);
    let mut bold = false;
    if whole {
        let inner: String = chars[2..chars.len() - 2].iter().collect();
        bold = !inner.contains("**") && !inner.contains("__");
        t = inner;
    }
    let t = strip_strong(&t);
    let t = strip_emphasis(&t);
    let t = CODE.replace_all(&t, "$1");
    let t = LINK.replace_all(&t, "$1");
    let t = ESCAPE.replace_all(&t, "$1");
    (trim_js(&t).to_string(), bold)
}

fn indent_width(spaces: &str) -> f64 {
    spaces.replace('\t', "    ").encode_utf16().count() as f64
}

fn plain(text: String, heading: Option<i64>, bold: bool) -> ListParagraph {
    ListParagraph {
        para: OutlineParagraph { text, heading_level: heading, is_title: false, bold, list_level: None },
        in_list: false,
        ilvl: 0.0,
        indent: None,
    }
}

pub fn read_markdown(md: &str) -> Vec<OutlineParagraph> {
    let normalised = md.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = normalised.split('\n').collect();
    let mut out: Vec<ListParagraph> = Vec::new();
    let mut in_fence = false;
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        i += 1;
        if FENCE.is_match(line) {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || trim_js(line).is_empty() || RULE.is_match(line) || TABLE.is_match(line) {
            continue;
        }
        if let Some(h) = HEADING.captures(line) {
            let (text, _) = inline(&h[2]);
            if !text.is_empty() {
                out.push(plain(text, Some(h[1].len() as i64), true));
            }
            continue;
        }
        // "Title\n=====" and "Title\n-----" headings.
        if let Some(u) = lines.get(i).and_then(|next| SETEXT.captures(next))
            && !ORDERED.is_match(line)
            && !BULLET.is_match(line)
        {
            let (text, _) = inline(line);
            let level = if u[1].starts_with('=') { 1 } else { 2 };
            out.push(plain(text, Some(level), true));
            i += 1;
            continue;
        }
        let ordered = ORDERED.captures(line);
        let bullet = if ordered.is_some() { None } else { BULLET.captures(line) };
        if let Some(caps) = ordered.as_ref().or(bullet.as_ref()) {
            let indent = indent_width(&caps[1]);
            // "**1. Nível**" and "1. **Nível**" both make a bold numbered line.
            let (text, bold) = match &ordered {
                Some(o) => {
                    let (t, b) = inline(&o[3]);
                    (if t.is_empty() { t } else { format!("{} {}", &o[2], t) }, b)
                }
                None => inline(&caps[2]),
            };
            if !text.is_empty() {
                out.push(ListParagraph {
                    para: OutlineParagraph { text, heading_level: None, is_title: false, bold, list_level: None },
                    in_list: true,
                    ilvl: 0.0,
                    indent: Some(indent * 100.0),
                });
            }
            continue;
        }
        let (text, bold) = inline(&QUOTE.replace(line, ""));
        if !text.is_empty() {
            out.push(plain(text, None, bold));
        }
    }
    list_levels_from_indents(out)
}
