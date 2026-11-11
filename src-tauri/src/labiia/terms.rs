//! labiia_quali's words over Magnolia's catalogues for the menus and
//! dialogs: "características" and "atributos" for tags and tag categories,
//! and labiia_quali as the program's name (Magnolia where it is credited).
//! Same files the interface applies (src/renderer/labiia/terms.ts).

use serde_json::Value;

const TERMS: &[(&str, &str)] = &[
    ("en", include_str!("../../../src/renderer/locales/labiia/en.json")),
    ("pt-BR", include_str!("../../../src/renderer/locales/labiia/pt-BR.json")),
];

fn merge(base: &mut Value, over: &Value) {
    match (base, over) {
        (Value::Object(b), Value::Object(o)) => {
            for (k, v) in o {
                match b.get_mut(k) {
                    Some(slot) if slot.is_object() && v.is_object() => merge(slot, v),
                    _ => {
                        b.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (b, o) => *b = o.clone(),
    }
}

/// Lays the language's terms over its catalogue, if it has any.
pub fn apply(language: &str, catalogue: &mut Value) {
    if let Some((_, text)) = TERMS.iter().find(|(id, _)| *id == language)
        && let Ok(over) = serde_json::from_str::<Value>(text)
    {
        merge(catalogue, &over);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menus_say_labiia_quali_and_characteristics() {
        let mut pt: Value = serde_json::json!({ "native": { "menu": { "about": "Sobre o Magnolia", "copy": "Copiar" } } });
        apply("pt-BR", &mut pt);
        assert_eq!(pt["native"]["menu"]["about"], "Sobre o labiia_quali");
        assert_eq!(pt["native"]["menu"]["copy"], "Copiar");
    }
}
