//! The researcher's choices, saved with the project, turned into the table
//! of replacements the lexical engine applies.
//!
//! The order is fixed, so the same choices always give the same corpus:
//! 1. expressions become one word before the text is cut into words;
//! 2. the researcher's equivalences;
//! 3. accepted spelling variants;
//! 4. plurals the dictionary does not list;
//! then the engine's dictionary lemmatises as before.
//! When a word is named in more than one step, the earlier step wins. Chains
//! are followed to the end ("politicas" → "políticas" → "política"), and a
//! circle of replacements ("a" → "b", "b" → "a") is dropped, since no word
//! in it can be the final one.

use crate::lexique::Lexique;
use crate::plural;
use crate::text::{Corpus, line_tokens};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Choices {
    pub enabled: bool,
    pub plurals: PluralChoices,
    pub variants: VariantChoices,
    pub equivalences: EquivalenceChoices,
    pub expressions: ExpressionChoices,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PluralChoices {
    pub enabled: bool,
    /// Plurals the researcher chose to keep apart.
    pub excluded: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct VariantChoices {
    pub enabled: bool,
    pub groups: Vec<VariantGroup>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct VariantGroup {
    pub canonical: String,
    pub variants: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct EquivalenceChoices {
    pub enabled: bool,
    pub pairs: Vec<Equivalence>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Equivalence {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ExpressionChoices {
    pub enabled: bool,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Summary {
    pub expressions: usize,
    pub equivalences: usize,
    pub variants: usize,
    pub plurals: usize,
}

/// What the engine applies. `expressions` are phrases (words separated by
/// one space) and the single word each becomes, longest first; `forms`
/// replaces one word by another, already followed to its final word.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Table {
    pub expressions: Vec<(String, String)>,
    pub forms: BTreeMap<String, String>,
    pub summary: Summary,
}

impl Table {
    pub fn is_empty(&self) -> bool {
        self.expressions.is_empty() && self.forms.is_empty()
    }
}

/// A phrase's words as the engine cuts them ("Pós-graduação" → ["pós", "graduação"]).
fn phrase_words(s: &str) -> Vec<String> {
    line_tokens(s).into_iter().flatten().collect()
}

/// The single word a phrase becomes.
fn joined(s: &str) -> String {
    phrase_words(s).join("_")
}

pub fn build(choices: &Choices, corpus: &Corpus, lex: &Lexique) -> Table {
    let mut table = Table::default();
    if !choices.enabled {
        return table;
    }
    let mut expressions: Vec<(String, String)> = Vec::new();
    let mut seen_phrases: HashSet<String> = HashSet::new();
    let mut add_expression = |words: Vec<String>, target: String, out: &mut Vec<(String, String)>| -> bool {
        let phrase = words.join(" ");
        if words.len() < 2 || target.is_empty() || !seen_phrases.insert(phrase.clone()) {
            return false;
        }
        out.push((phrase, target));
        true
    };

    if choices.expressions.enabled {
        for item in &choices.expressions.items {
            let words = phrase_words(item);
            let target = words.join("_");
            if add_expression(words, target, &mut expressions) {
                table.summary.expressions += 1;
            }
        }
    }

    // Each step adds only words no earlier step named.
    let mut forms: BTreeMap<String, String> = BTreeMap::new();
    let put = |from: String, to: String, forms: &mut BTreeMap<String, String>| -> bool {
        if from.is_empty() || to.is_empty() || from == to || forms.contains_key(&from) {
            return false;
        }
        forms.insert(from, to);
        true
    };

    if choices.equivalences.enabled {
        for p in &choices.equivalences.pairs {
            let from = phrase_words(&p.from);
            let to = joined(&p.to);
            let ok = match from.len() {
                0 => false,
                1 => put(from[0].clone(), to, &mut forms),
                // "sistema único de saúde → sus": the phrase is replaced as an expression.
                _ => add_expression(from, to, &mut expressions),
            };
            if ok {
                table.summary.equivalences += 1;
            }
        }
    }

    if choices.variants.enabled {
        for g in &choices.variants.groups {
            let to = joined(&g.canonical);
            for v in &g.variants {
                if put(joined(v), to.clone(), &mut forms) {
                    table.summary.variants += 1;
                }
            }
        }
    }

    if choices.plurals.enabled {
        let excluded: HashSet<&str> = choices.plurals.excluded.iter().map(String::as_str).collect();
        for p in plural::suggest(&corpus.freq, lex) {
            if !excluded.contains(p.plural.as_str()) && put(p.plural, p.singular, &mut forms) {
                table.summary.plurals += 1;
            }
        }
    }

    table.forms = resolve(&forms);
    expressions.sort_by(|a, b| {
        b.0.split(' ').count().cmp(&a.0.split(' ').count()).then(b.0.len().cmp(&a.0.len())).then(a.0.cmp(&b.0))
    });
    // An expression's single word follows the word replacements too.
    table.expressions = expressions
        .into_iter()
        .map(|(p, t)| {
            let t = table.forms.get(&t).cloned().unwrap_or(t);
            (p, t)
        })
        .collect();
    table
}

/// Each word replaced by the end of its chain; circles are dropped.
fn resolve(forms: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for start in forms.keys() {
        let mut seen: HashSet<&str> = HashSet::from([start.as_str()]);
        let mut cur = start.as_str();
        let mut circle = false;
        while let Some(next) = forms.get(cur) {
            if !seen.insert(next.as_str()) {
                circle = true;
                break;
            }
            cur = next;
        }
        if !circle && cur != start {
            out.insert(start.clone(), cur.to_string());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Lang;
    use crate::lexique::sample;

    fn corpus(text: &str) -> Corpus {
        Corpus::new(&[text.to_string()])
    }

    #[test]
    fn nothing_is_replaced_while_the_preparation_is_off() {
        let lex = sample(Lang::Pt, &[("slam", "nom")]);
        let mut c = Choices::default();
        c.plurals.enabled = true;
        assert!(build(&c, &corpus("slams slams"), &lex).is_empty());
    }

    #[test]
    fn earlier_steps_win_and_chains_reach_the_final_word() {
        let lex = sample(Lang::Pt, &[("política", "nom"), ("professor", "nom")]);
        let c = Choices {
            enabled: true,
            equivalences: EquivalenceChoices {
                enabled: true,
                pairs: vec![
                    Equivalence { from: "Docente".into(), to: "professor".into() },
                    Equivalence { from: "Sistema Único de Saúde".into(), to: "SUS".into() },
                ],
            },
            variants: VariantChoices {
                enabled: true,
                groups: vec![VariantGroup { canonical: "políticas".into(), variants: vec!["politicas".into(), "políticas".into()] }],
            },
            plurals: PluralChoices { enabled: true, excluded: vec![] },
            expressions: ExpressionChoices { enabled: true, items: vec!["política pública".into(), "pós-graduação".into()] },
        };
        let t = build(&c, &corpus("docente politicas políticas política"), &lex);
        assert_eq!(t.forms.get("docente").map(String::as_str), Some("professor"));
        // "politicas" → "políticas" (variant) → "política" (plural rule).
        assert_eq!(t.forms.get("politicas").map(String::as_str), Some("política"));
        assert_eq!(t.forms.get("políticas").map(String::as_str), Some("política"));
        assert_eq!(
            t.expressions,
            vec![
                ("sistema único de saúde".to_string(), "sus".to_string()),
                ("política pública".to_string(), "política_pública".to_string()),
                ("pós graduação".to_string(), "pós_graduação".to_string()),
            ]
        );
        assert_eq!(t.summary, Summary { expressions: 2, equivalences: 2, variants: 1, plurals: 1 });
    }

    #[test]
    fn a_circle_of_replacements_is_dropped() {
        let lex = sample(Lang::Pt, &[]);
        let c = Choices {
            enabled: true,
            equivalences: EquivalenceChoices {
                enabled: true,
                pairs: vec![Equivalence { from: "aluno".into(), to: "estudante".into() }, Equivalence { from: "estudante".into(), to: "aluno".into() }],
            },
            ..Default::default()
        };
        assert!(build(&c, &corpus("aluno estudante"), &lex).forms.is_empty());
    }

    #[test]
    fn plurals_the_researcher_excluded_stay_apart() {
        let lex = sample(Lang::Pt, &[("slam", "nom"), ("podcast", "nom")]);
        let c = Choices {
            enabled: true,
            plurals: PluralChoices { enabled: true, excluded: vec!["slams".into()] },
            ..Default::default()
        };
        let t = build(&c, &corpus("slams podcasts"), &lex);
        assert_eq!(t.forms.len(), 1);
        assert_eq!(t.forms.get("podcasts").map(String::as_str), Some("podcast"));
    }
}
