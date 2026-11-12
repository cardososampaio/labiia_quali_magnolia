//! Corpus preparation for labiia_quali's lexical analyses.
//!
//! The analyses already lemmatise with IRaMuTeQ's dictionaries ("casas" is
//! counted as "casa" because the dictionary lists it). This crate finds what
//! the dictionary leaves apart, so the researcher can choose to join it:
//!
//! - plurals the dictionary does not list, when their singular exists
//!   (`plural`);
//! - spellings of the same word that differ by accents or a typo
//!   (`variants`, the clustering methods of OpenRefine);
//! - the researcher's own equivalences ("docente" = "professor");
//! - expressions of two or three words that work as one term (`compounds`).
//!
//! Nothing here changes a corpus by itself: suggestions are reviewed, and
//! `table::build` turns the accepted choices into a table of replacements
//! that the lexical engine applies while it prepares the corpus. With no
//! table, the engine gives the same results as before.

pub mod compounds;
pub mod lexique;
pub mod plural;
pub mod table;
pub mod text;
pub mod variants;

use serde::{Deserialize, Serialize};

/// The corpus languages of the lexical analyses (each has its IRaMuTeQ dictionary).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    Pt,
    En,
    Es,
}

impl Lang {
    pub fn parse(s: &str) -> Option<Lang> {
        match s {
            "pt" => Some(Lang::Pt),
            "en" => Some(Lang::En),
            "es" => Some(Lang::Es),
            _ => None,
        }
    }

    /// Suffix of the resource files (`lexique_sp.txt` is Spanish, as in IRaMuTeQ).
    pub fn dictionary_suffix(self) -> &'static str {
        match self {
            Lang::Pt => "pt",
            Lang::En => "en",
            Lang::Es => "sp",
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Lang::Pt => "pt",
            Lang::En => "en",
            Lang::Es => "es",
        }
    }
}
