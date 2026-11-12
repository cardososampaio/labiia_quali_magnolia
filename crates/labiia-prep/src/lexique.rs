//! IRaMuTeQ's dictionaries (`lexique_<lang>.txt`: form, lemma, class) and
//! the language's stopword list, read from the program's resources.
//!
//! Suggestions only ask whether the dictionary knows a word, exactly as the
//! engine looks it up: Portuguese as written, English and Spanish also
//! without accents (their dictionaries omit accents real texts carry).

use crate::Lang;
use crate::text::fold;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Classes that count as content words (IRaMuTeQ's key.cfg); the others are function words.
const ACTIVE_CLASSES: [&str; 5] = ["nom", "ver", "adj", "adv", "nr"];

/// Pieces of web addresses and references, treated as function words in
/// every language (the engine's always-on list): "https doi org" or
/// "disponível em https" are never offered as expressions, nor "https" as
/// the plural of "http".
const NOISE: [&str; 30] = [
    "et", "al", "doi", "issn", "isbn", "http", "https", "www", "url", "html", "htm", "pdf", "php", "org", "gov",
    "edu", "com", "net", "br", "retrieved", "available", "acesso", "acessado", "disponível", "vol", "pp", "ed",
    "eds", "mailto", "file",
];

pub struct Lexique {
    pub lang: Lang,
    classes: HashMap<String, String>,
    folded: HashSet<String>,
    stopwords: HashSet<String>,
}

impl Lexique {
    /// `dir` is the `lexical` resources folder (with `dictionaries/` and `stopwords/`).
    pub fn load(dir: &Path, lang: Lang) -> std::io::Result<Lexique> {
        let dict = std::fs::read_to_string(
            dir.join("dictionaries")
                .join(format!("lexique_{}.txt", lang.dictionary_suffix())),
        )?;
        // A missing stopword list leaves only the dictionary's function words.
        let stop = std::fs::read_to_string(dir.join("stopwords").join(format!("{}.txt", lang.code())))
            .unwrap_or_default();
        Ok(Lexique::from_text(lang, &dict, &stop))
    }

    pub fn from_text(lang: Lang, dictionary: &str, stopwords: &str) -> Lexique {
        let mut classes = HashMap::new();
        let mut folded = HashSet::new();
        let mut stop: HashSet<String> = stopwords
            .lines()
            .map(|l| l.trim().to_lowercase())
            .filter(|l| !l.is_empty())
            .chain(NOISE.iter().map(|w| w.to_string()))
            .collect();
        for line in dictionary.lines() {
            let mut parts = line.split('\t');
            let (Some(form), Some(_lemma), Some(class)) = (parts.next(), parts.next(), parts.next()) else {
                continue;
            };
            let form = form.trim().to_lowercase();
            let class = class.trim().to_string();
            if form.is_empty() {
                continue;
            }
            if !ACTIVE_CLASSES.contains(&class.as_str()) {
                stop.insert(form.clone());
            }
            folded.insert(fold(&form));
            classes.insert(form, class);
        }
        Lexique { lang, classes, folded, stopwords: stop }
    }

    /// Whether the engine's dictionary lookup finds this word.
    pub fn knows(&self, word: &str) -> bool {
        self.classes.contains_key(word) || (self.lang != Lang::Pt && self.folded.contains(&fold(word)))
    }

    /// A function word: in the language's stopword list or of a non-content class.
    pub fn is_stopword(&self, word: &str) -> bool {
        self.stopwords.contains(word)
    }
}

#[cfg(test)]
pub(crate) fn sample(lang: Lang, words: &[(&str, &str)]) -> Lexique {
    let dict: String = words.iter().map(|(w, c)| format!("{w}\t{w}\t{c}\n")).collect();
    Lexique::from_text(lang, &dict, "de\nthe\nla\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portuguese_is_looked_up_as_written_other_languages_also_without_accents() {
        let pt = sample(Lang::Pt, &[("política", "nom")]);
        assert!(pt.knows("política"));
        assert!(!pt.knows("politica"));
        let es = sample(Lang::Es, &[("canción", "nom")]);
        assert!(es.knows("cancion"));
    }

    #[test]
    fn function_classes_count_as_stopwords() {
        let pt = sample(Lang::Pt, &[("para", "pre"), ("casa", "nom")]);
        assert!(pt.is_stopword("para"));
        assert!(pt.is_stopword("de"));
        assert!(!pt.is_stopword("casa"));
        assert!(pt.is_stopword("https"));
    }
}
