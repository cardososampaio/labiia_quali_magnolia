//! Expressions of two or three words that work as one term ("política
//! pública", "saúde mental"), suggested as labiia_lex's "Detectar
//! expressões compostas" does:
//!
//! - candidates are word sequences of 2 or 3 words, read line by line;
//! - they may not start or end with a function word, be mostly function
//!   words (over 40%), start or end with a month, end with a common verb
//!   ("mostra", "permite"), or pair two adjectives ("efetiva adequada");
//! - they must occur at least `min_freq` times and, when there are several
//!   texts, in at least two of them; a 3-word candidate must also open a
//!   line at least once (fewer windows cut through a sentence);
//! - the score is frequency × share of content words × the rarity of its
//!   words (Σ log(1 + total words ÷ word frequency)) × number of words,
//!   divided by the best score. labiia_lex keeps candidates from 0.35 up;
//!   here they are listed from 0.15 up, since the researcher picks each one.

use crate::lexique::Lexique;
use crate::text::{Corpus, is_alphabetic};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// Lowest relative score listed.
pub const LIST_THRESHOLD: f64 = 0.15;
const MAX_LINES: usize = 30_000;
const MAX_TOKENS: usize = 250_000;
const MAX_LINE_TOKENS: usize = 120;
const MAX_RESULTS: usize = 100;

const TRAILING_VERBS: [&str; 28] = [
    "acontece", "acontecem", "ajuda", "ajudam", "aparece", "aparecem", "cresce", "crescem", "demonstra",
    "demonstram", "faz", "fazem", "gera", "geram", "indica", "indicam", "mostra", "mostram", "ocorre",
    "ocorrem", "permite", "permitem", "produz", "produzem", "revela", "revelam", "sugere", "sugerem",
];
const MONTHS: [&str; 13] = [
    "janeiro", "fevereiro", "marco", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
    "outubro", "novembro", "dezembro",
];
const LEADING_ADJ: [&str; 6] = ["iva", "ivo", "ivas", "ivos", "ial", "iais"];
const TRAILING_ADJ: [&str; 14] = [
    "iva", "ivo", "ivas", "ivos", "ial", "iais", "ada", "ado", "adas", "ados", "ida", "ido", "idas", "idos",
];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Candidate {
    pub expression: String,
    /// The single word it becomes ("política_pública").
    pub replacement: String,
    pub frequency: u32,
    pub documents: u32,
    pub score: f64,
    /// Score divided by the best one (0–1).
    pub relative: f64,
    /// Up to two lines where it occurs.
    pub examples: Vec<String>,
}

fn weak(parts: &[&str], lex: &Lexique) -> bool {
    let (first, last) = (parts[0], parts[parts.len() - 1]);
    if MONTHS.contains(&first) || MONTHS.contains(&last) {
        return true;
    }
    let stops = parts.iter().filter(|p| lex.is_stopword(p)).count();
    if stops as f64 / parts.len() as f64 > 0.4 {
        return true;
    }
    if TRAILING_VERBS.contains(&last) {
        return true;
    }
    parts.len() == 2
        && LEADING_ADJ.iter().any(|s| first.ends_with(s))
        && TRAILING_ADJ.iter().any(|s| last.ends_with(s))
}

/// The words of a line as labiia_lex reads them for this: letters only, two or more.
fn words(line: &[Option<String>]) -> Vec<&str> {
    line.iter()
        .flatten()
        .map(String::as_str)
        .filter(|w| w.chars().count() >= 2 && is_alphabetic(w))
        .take(MAX_LINE_TOKENS)
        .collect()
}

pub fn suggest(corpus: &Corpus, lex: &Lexique, min_freq: u32) -> Vec<Candidate> {
    let min_freq = min_freq.max(1);
    // (text, words) of every line with at least two words, within the size limits.
    let mut lines: Vec<(usize, Vec<&str>)> = Vec::new();
    let mut consumed = 0;
    'units: for (u, unit) in corpus.units.iter().enumerate() {
        for line in unit {
            if lines.len() >= MAX_LINES || consumed >= MAX_TOKENS {
                break 'units;
            }
            let ws = words(line);
            consumed += ws.len();
            if ws.len() >= 2 {
                lines.push((u, ws));
            }
        }
    }
    let total_docs = lines.iter().map(|(u, _)| *u).collect::<HashSet<_>>().len();
    let mut unigrams: HashMap<&str, u32> = HashMap::new();
    for (_, ws) in &lines {
        for w in ws {
            *unigrams.entry(w).or_insert(0) += 1;
        }
    }
    let total: u32 = unigrams.values().sum();

    let mut counts: HashMap<Vec<&str>, (u32, HashSet<usize>, u32)> = HashMap::new();
    for (u, ws) in &lines {
        for n in 2..=3.min(ws.len()) {
            for start in 0..=ws.len() - n {
                let g = &ws[start..start + n];
                if lex.is_stopword(g[0]) || lex.is_stopword(g[n - 1]) || weak(g, lex) {
                    continue;
                }
                let e = counts.entry(g.to_vec()).or_insert((0, HashSet::new(), 0));
                e.0 += 1;
                e.1.insert(*u);
                if start == 0 {
                    e.2 += 1;
                }
            }
        }
    }

    let mut scored: Vec<(Vec<&str>, u32, u32, f64)> = counts
        .into_iter()
        .filter(|(g, (f, docs, starts))| {
            *f >= min_freq && !(total_docs > 1 && docs.len() < 2) && !(g.len() >= 3 && *starts == 0)
        })
        .map(|(g, (f, docs, _))| {
            let density = g.iter().filter(|w| !lex.is_stopword(w)).count() as f64 / g.len() as f64;
            let rarity: f64 = g
                .iter()
                .map(|w| (1.0 + total as f64 / f64::from(unigrams.get(w).copied().unwrap_or(1).max(1))).ln())
                .sum();
            let score = f64::from(f) * density * rarity * g.len() as f64;
            (g, f, docs.len() as u32, score)
        })
        .filter(|(_, _, _, s)| *s > 0.0)
        .collect();
    let best = scored.iter().map(|x| x.3).fold(0.0, f64::max);
    if best <= 0.0 {
        return Vec::new();
    }
    scored.retain(|x| x.3 / best >= LIST_THRESHOLD);
    scored.sort_by(|a, b| {
        b.3.partial_cmp(&a.3)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.1.cmp(&a.1))
            .then(b.0.len().cmp(&a.0.len()))
            .then(a.0.cmp(&b.0))
    });
    scored.truncate(MAX_RESULTS);

    let mut out: Vec<Candidate> = scored
        .into_iter()
        .map(|(g, f, d, s)| Candidate {
            expression: g.join(" "),
            replacement: g.join("_"),
            frequency: f,
            documents: d,
            score: s,
            relative: s / best,
            examples: Vec::new(),
        })
        .collect();
    // Two lines where each one occurs, so the researcher sees it in use.
    for c in &mut out {
        let want: Vec<&str> = c.expression.split(' ').collect();
        'search: for (_, ws) in &lines {
            if ws.windows(want.len()).any(|w| w == want.as_slice()) {
                c.examples.push(ws.join(" "));
                if c.examples.len() == 2 {
                    break 'search;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Lang;
    use crate::lexique::sample;

    #[test]
    fn frequent_content_expressions_in_several_texts_are_suggested() {
        let lex = sample(Lang::Pt, &[("da", "pre"), ("a", "art_def"), ("é", "ver_sup")]);
        let texts: Vec<String> = vec![
            "A política pública da cidade.\nPolítica pública é urgente. Saúde mental.".into(),
            "Política pública e saúde mental.\nA saúde mental da escola.".into(),
            "Outra política pública.".into(),
        ];
        let c = suggest(&Corpus::new(&texts), &lex, 3);
        let names: Vec<&str> = c.iter().map(|x| x.expression.as_str()).collect();
        assert!(names.contains(&"política pública"), "{names:?}");
        assert!(names.contains(&"saúde mental"), "{names:?}");
        let pp = c.iter().find(|x| x.expression == "política pública").unwrap();
        assert_eq!(pp.replacement, "política_pública");
        assert_eq!(pp.frequency, 4);
        assert!(!pp.examples.is_empty());
        // Never one that starts or ends in a function word.
        assert!(!names.iter().any(|n| n.starts_with("a ") || n.ends_with(" da")));
    }

    #[test]
    fn an_expression_from_one_text_only_is_not_suggested() {
        let lex = sample(Lang::Pt, &[]);
        let texts: Vec<String> = vec!["saúde mental saúde mental saúde mental".into(), "outra coisa aqui".into()];
        assert!(suggest(&Corpus::new(&texts), &lex, 3).is_empty());
    }
}
