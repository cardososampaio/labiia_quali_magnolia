//! Words as the lexical engine reads them, so a suggestion names forms the
//! analyses will actually meet: lower case, the engine's set of letters,
//! and words split at apostrophes and hyphens ("pós-graduação" is "pós" and
//! "graduação"), as IRaMuTeQ's cleaning does.

use std::collections::HashMap;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

/// Letters the engine keeps in a word (its DROP_CHARS filter); any other
/// character ends the word.
fn is_word_char(c: char) -> bool {
    c.is_ascii_lowercase()
        || c.is_ascii_digit()
        || c == '_'
        || "àâäáåãéèêëìîïíóòôöõøùûüúçßœñ".contains(c)
}

/// Punctuation that ends a phrase: an expression never spans it.
fn is_phrase_break(c: char) -> bool {
    matches!(c, '.' | ':' | ';' | '!' | '?' | '…' | ',' | '(' | ')' | '"' | '“' | '”' | '[' | ']')
}

/// Without accents (NFD with the combining marks removed).
pub fn fold(s: &str) -> String {
    s.nfd().filter(|c| !is_combining_mark(*c)).nfc().collect()
}

/// One line's words in order; `None` marks punctuation that ends a phrase.
pub fn line_tokens(line: &str) -> Vec<Option<String>> {
    let lower = line.to_lowercase().replace('’', "'").replace('œ', "oe");
    let mut out = Vec::new();
    let mut word = String::new();
    let flush = |w: &mut String, out: &mut Vec<Option<String>>| {
        if !w.is_empty() {
            out.push(Some(std::mem::take(w)));
        }
    };
    for c in lower.chars() {
        if is_word_char(c) {
            word.push(c);
        } else {
            flush(&mut word, &mut out);
            if is_phrase_break(c) && out.last().is_some_and(Option::is_some) {
                out.push(None);
            }
        }
    }
    flush(&mut word, &mut out);
    out
}

/// A word made only of letters (no digits, no "_").
pub fn is_alphabetic(w: &str) -> bool {
    !w.is_empty() && w.chars().all(char::is_alphabetic)
}

/// The texts as the suggestions read them: one entry per text unit, its
/// lines, and how often each word occurs in the whole corpus.
pub struct Corpus {
    pub units: Vec<Vec<Vec<Option<String>>>>,
    pub freq: HashMap<String, u32>,
}

impl Corpus {
    pub fn new(texts: &[String]) -> Corpus {
        let mut freq = HashMap::new();
        let units = texts
            .iter()
            .map(|t| {
                t.lines()
                    .map(str::trim)
                    // IRaMuTeQ headings ("**** *var") are not text.
                    .filter(|l| !l.is_empty() && !l.starts_with("****") && !l.starts_with("-*"))
                    .map(|l| {
                        let toks = line_tokens(l);
                        for w in toks.iter().flatten() {
                            *freq.entry(w.clone()).or_insert(0) += 1;
                        }
                        toks
                    })
                    .collect()
            })
            .collect();
        Corpus { units, freq }
    }

    /// Words by frequency, most frequent first, ties in alphabetical order.
    pub fn vocabulary(&self) -> Vec<(&str, u32)> {
        let mut v: Vec<(&str, u32)> = self.freq.iter().map(|(w, f)| (w.as_str(), *f)).collect();
        v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_split_like_the_engine_at_hyphens_and_apostrophes() {
        let t: Vec<_> = line_tokens("A Pós-graduação d’água, e SUS.").into_iter().collect();
        assert_eq!(
            t,
            vec![
                Some("a".into()),
                Some("pós".into()),
                Some("graduação".into()),
                Some("d".into()),
                Some("água".into()),
                None,
                Some("e".into()),
                Some("sus".into()),
                None
            ]
        );
    }

    #[test]
    fn folding_removes_accents_only() {
        assert_eq!(fold("Política pública ção"), "Politica publica cao");
    }

    #[test]
    fn headings_are_not_counted() {
        let c = Corpus::new(&["**** *ano_2020\nCasa casa".into()]);
        assert_eq!(c.freq.get("casa"), Some(&2));
        assert!(!c.freq.contains_key("ano_2020"));
    }
}
