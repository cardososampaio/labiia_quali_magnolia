//! Spellings of the same word: "politica" and "política", "democrácia" and
//! "democracia", "pesquisadoras" typed "pesquisdoras". The three clustering
//! methods of OpenRefine, reimplemented from its public documentation
//! (labiia_lex's "Normalizar formas" uses the same three):
//!
//! - fingerprint: the same word once accents are removed;
//! - character n-grams: the same set of 2- or 3-letter pieces;
//! - edit distance: at most 1 or 2 letters apart, compared only among
//!   words that start with the same three letters (without accents).
//!
//! Each group proposes its most frequent spelling. Groups are suggestions:
//! two real words may look alike ("pais" and "país"), so the researcher
//! accepts each one.

use crate::text::{fold, is_alphabetic};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Method {
    Fingerprint,
    Ngram2,
    Ngram3,
    Levenshtein1,
    Levenshtein2,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Variant {
    pub word: String,
    pub frequency: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Group {
    pub canonical: String,
    /// Every spelling, the canonical one included, most frequent first.
    pub variants: Vec<Variant>,
    pub frequency: u32,
}

/// Words shorter than this, or rarer, are not grouped (labiia_lex's limits).
pub const MIN_LENGTH: usize = 4;
pub const MIN_FREQUENCY: u32 = 2;
const MAX_VOCABULARY: usize = 50_000;

fn fingerprint(w: &str) -> String {
    fold(w).chars().filter(|c| c.is_alphanumeric()).collect()
}

fn ngram_fingerprint(w: &str, n: usize) -> String {
    let base: Vec<char> = fingerprint(w).chars().collect();
    if base.len() < n {
        return base.into_iter().collect();
    }
    let grams: std::collections::BTreeSet<String> = base.windows(n).map(|g| g.iter().collect()).collect();
    grams.into_iter().collect()
}

pub fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0; b.len() + 1];
    for i in 1..=a.len() {
        curr[0] = i;
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            curr[j] = (prev[j] + 1).min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

fn group(words: Vec<&str>, freq: &HashMap<String, u32>) -> Group {
    let mut variants: Vec<Variant> = words
        .into_iter()
        .map(|w| Variant { word: w.to_string(), frequency: freq.get(w).copied().unwrap_or(0) })
        .collect();
    variants.sort_by(|a, b| b.frequency.cmp(&a.frequency).then(a.word.cmp(&b.word)));
    Group {
        canonical: variants[0].word.clone(),
        frequency: variants.iter().map(|v| v.frequency).sum(),
        variants,
    }
}

/// Groups of spellings found by one method, the most frequent groups first.
pub fn suggest(freq: &HashMap<String, u32>, method: Method) -> Vec<Group> {
    let mut vocab: Vec<(&str, u32)> = freq
        .iter()
        .filter(|(w, f)| **f >= MIN_FREQUENCY && w.chars().count() >= MIN_LENGTH && is_alphabetic(w))
        .map(|(w, f)| (w.as_str(), *f))
        .collect();
    vocab.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    vocab.truncate(MAX_VOCABULARY);

    let mut groups: Vec<Group> = match method {
        Method::Fingerprint | Method::Ngram2 | Method::Ngram3 => {
            let key = |w: &str| match method {
                Method::Ngram2 => ngram_fingerprint(w, 2),
                Method::Ngram3 => ngram_fingerprint(w, 3),
                _ => fingerprint(w),
            };
            let mut by_key: BTreeMap<String, Vec<&str>> = BTreeMap::new();
            for (w, _) in &vocab {
                by_key.entry(key(w)).or_default().push(w);
            }
            by_key.into_values().filter(|ws| ws.len() > 1).map(|ws| group(ws, freq)).collect()
        }
        Method::Levenshtein1 | Method::Levenshtein2 => {
            let threshold = if method == Method::Levenshtein1 { 1 } else { 2 };
            let mut blocks: BTreeMap<String, Vec<&str>> = BTreeMap::new();
            for (w, _) in &vocab {
                blocks.entry(fold(w).chars().take(3).collect()).or_default().push(w);
            }
            let mut visited: HashSet<&str> = HashSet::new();
            let mut out = Vec::new();
            for words in blocks.values() {
                for (i, w1) in words.iter().enumerate() {
                    if visited.contains(w1) {
                        continue;
                    }
                    let f1 = fold(w1);
                    let mut members = vec![*w1];
                    for w2 in &words[i + 1..] {
                        if !visited.contains(w2) && levenshtein(&f1, &fold(w2)) <= threshold {
                            members.push(w2);
                            visited.insert(w2);
                        }
                    }
                    if members.len() > 1 {
                        visited.insert(w1);
                        out.push(group(members, freq));
                    }
                }
            }
            out
        }
    };
    groups.sort_by(|a, b| b.frequency.cmp(&a.frequency).then(a.canonical.cmp(&b.canonical)));
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    fn freq(words: &[(&str, u32)]) -> HashMap<String, u32> {
        words.iter().map(|(w, f)| (w.to_string(), *f)).collect()
    }

    #[test]
    fn fingerprint_joins_spellings_that_differ_only_by_accents() {
        let g = suggest(&freq(&[("política", 9), ("politica", 3), ("polícia", 4)]), Method::Fingerprint);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].canonical, "política");
        assert_eq!(g[0].frequency, 12);
        assert_eq!(g[0].variants.iter().map(|v| v.word.as_str()).collect::<Vec<_>>(), ["política", "politica"]);
    }

    #[test]
    fn ngrams_join_words_made_of_the_same_pieces() {
        let g = suggest(&freq(&[("democracia", 5), ("democrácia", 2), ("cidade", 3)]), Method::Ngram2);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].canonical, "democracia");
    }

    #[test]
    fn edit_distance_joins_typos_within_the_threshold() {
        let f = freq(&[("pesquisadoras", 8), ("pesquisdoras", 2), ("pesquisadores", 6)]);
        let one = suggest(&f, Method::Levenshtein1);
        assert_eq!(one.len(), 1);
        // The most frequent word takes the closest spellings first.
        assert_eq!(one[0].variants.len(), 3);
        assert_eq!(levenshtein("casa", "caso"), 1);
        assert_eq!(levenshtein("pesquisdoras", "pesquisadores"), 2);
    }

    #[test]
    fn short_or_rare_words_are_not_grouped() {
        // Four letters are enough: "pais" and "país" are offered, and the researcher decides.
        assert!(!suggest(&freq(&[("país", 5), ("pais", 5)]), Method::Fingerprint).is_empty());
        assert!(suggest(&freq(&[("avó", 5), ("avo", 5)]), Method::Fingerprint).is_empty());
        assert!(suggest(&freq(&[("política", 5), ("politica", 1)]), Method::Fingerprint).is_empty());
    }
}
