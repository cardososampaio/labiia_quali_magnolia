//! Plurals the dictionary does not list, joined to their singular.
//!
//! The dictionary already turns the plurals it knows into their lemma. A
//! plural it does not know ("slams", "influenciadores", "podcasts") would
//! count apart from its singular. A plural rule is applied only when the
//! word is unknown to the dictionary and the singular it gives exists, in
//! the dictionary or in the corpus itself, so a word that merely ends in
//! "s" ("lápis", "ônibus", "bus") is left alone.

use crate::Lang;
use crate::lexique::Lexique;
use crate::text::is_alphabetic;
use serde::Serialize;
use std::collections::HashMap;

/// Possible singulars of a word, most specific rule first.
pub fn candidates(word: &str, lang: Lang) -> Vec<String> {
    let w = word;
    let n = w.chars().count();
    let mut out: Vec<String> = Vec::new();
    let mut push = |v: String| {
        if v.chars().count() >= 2 && v != w && !out.contains(&v) {
            out.push(v);
        }
    };
    let cut = |k: usize| -> String { w.chars().take(n - k).collect() };
    let ends = |s: &str| w.ends_with(s);
    if n < 4 {
        return out;
    }
    match lang {
        Lang::Pt => {
            if ends("ões") || ends("ães") || ends("ãos") {
                push(cut(3) + "ão");
            }
            if ends("ais") {
                push(cut(3) + "al");
            }
            if ends("eis") {
                push(cut(3) + "el");
            }
            if ends("óis") {
                push(cut(3) + "ol");
            }
            if ends("is") {
                push(cut(2) + "il");
            }
            if ends("ns") {
                push(cut(2) + "m");
            }
            if ends("res") || ends("zes") || ends("ses") {
                push(cut(2));
            }
            if ends("s") && !ends("ss") {
                push(cut(1));
            }
        }
        Lang::En => {
            if ends("ies") {
                push(cut(3) + "y");
            }
            if ends("ves") {
                push(cut(3) + "f");
                push(cut(3) + "fe");
            }
            if ends("ses") || ends("xes") || ends("zes") || ends("ches") || ends("shes") {
                push(cut(2));
            }
            if ends("s") && !ends("ss") && !ends("us") && !ends("is") {
                push(cut(1));
            }
        }
        Lang::Es => {
            if ends("ces") {
                push(cut(3) + "z");
            }
            if ends("s") && !ends("ss") {
                push(cut(1));
            }
            if ends("es") {
                push(cut(2));
            }
        }
    }
    out
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PluralPair {
    pub plural: String,
    pub singular: String,
    pub frequency: u32,
}

/// Plural → singular pairs found in the corpus, most frequent plural first.
pub fn suggest(freq: &HashMap<String, u32>, lex: &Lexique) -> Vec<PluralPair> {
    let mut out: Vec<PluralPair> = freq
        .iter()
        .filter(|(w, _)| is_alphabetic(w) && !lex.knows(w) && !lex.is_stopword(w))
        .filter_map(|(w, f)| {
            candidates(w, lex.lang)
                .into_iter()
                .find(|s| lex.knows(s) || freq.contains_key(s))
                .map(|s| PluralPair { plural: w.clone(), singular: s, frequency: *f })
        })
        .collect();
    out.sort_by(|a, b| b.frequency.cmp(&a.frequency).then(a.plural.cmp(&b.plural)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexique::sample;

    fn freq(words: &[(&str, u32)]) -> HashMap<String, u32> {
        words.iter().map(|(w, f)| (w.to_string(), *f)).collect()
    }

    #[test]
    fn portuguese_rules_join_unknown_plurals_to_a_known_singular() {
        let lex = sample(Lang::Pt, &[("ação", "nom"), ("canal", "nom"), ("papel", "nom"), ("item", "nom"), ("influenciador", "nom")]);
        let f = freq(&[("açãozinhas", 1), ("canais", 3), ("papéis", 1), ("itens", 2), ("influenciadores", 4)]);
        let got: Vec<(String, String)> = suggest(&f, &lex).into_iter().map(|p| (p.plural, p.singular)).collect();
        assert!(got.contains(&("canais".into(), "canal".into())));
        assert!(got.contains(&("itens".into(), "item".into())));
        assert!(got.contains(&("influenciadores".into(), "influenciador".into())));
        // "papéis" → "papel" needs the accent dropped: not a rule, left for the variants.
        assert!(!got.iter().any(|(p, _)| p == "papéis"));
    }

    #[test]
    fn a_singular_found_only_in_the_corpus_is_enough() {
        let lex = sample(Lang::Pt, &[]);
        let got = suggest(&freq(&[("slams", 2), ("slam", 5)]), &lex);
        assert_eq!(got, vec![PluralPair { plural: "slams".into(), singular: "slam".into(), frequency: 2 }]);
    }

    #[test]
    fn words_that_only_end_in_s_are_left_alone() {
        let lex = sample(Lang::Pt, &[("lápis", "nom"), ("ônibus", "nom")]);
        assert!(suggest(&freq(&[("lápis", 3), ("ônibus", 2), ("pires", 1)]), &lex).is_empty());
        let en = sample(Lang::En, &[]);
        assert!(suggest(&freq(&[("corpus", 3), ("analysis", 2), ("class", 2), ("clas", 1)]), &en).is_empty());
    }

    #[test]
    fn english_and_spanish_have_their_own_rules() {
        let en = sample(Lang::En, &[("policy", "nom"), ("leaf", "nom"), ("box", "nom"), ("podcast", "nom")]);
        let got: Vec<String> = suggest(&freq(&[("policies", 3), ("leaves", 1), ("boxes", 1), ("podcasts", 2)]), &en)
            .into_iter()
            .map(|p| p.singular)
            .collect();
        assert_eq!(got, vec!["policy", "podcast", "box", "leaf"]);
        let es = sample(Lang::Es, &[("luz", "nom"), ("ciudad", "nom"), ("clase", "nom"), ("canción", "nom")]);
        let got: Vec<(String, String)> = suggest(&freq(&[("luces", 1), ("ciudades", 1), ("clases", 1), ("canciones", 1)]), &es)
            .into_iter()
            .map(|p| (p.plural, p.singular))
            .collect();
        assert!(got.contains(&("luces".into(), "luz".into())));
        assert!(got.contains(&("ciudades".into(), "ciudad".into())));
        assert!(got.contains(&("clases".into(), "clase".into())));
        // Known without its accent, as the engine looks Spanish up.
        assert!(got.contains(&("canciones".into(), "cancion".into())));
    }

    #[test]
    fn words_the_dictionary_knows_are_left_to_it() {
        let lex = sample(Lang::Pt, &[("casas", "nom"), ("casa", "nom")]);
        assert!(suggest(&freq(&[("casas", 9)]), &lex).is_empty());
    }
}
