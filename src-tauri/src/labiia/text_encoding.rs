//! Plain-text files (.txt, .md, .srt, .vtt, .html) come in more than one
//! character encoding. Transcripts saved by older Windows programs, such as
//! the old Notepad or exports from older systems, are often in the Windows
//! Western encoding (Windows-1252, a superset of Latin-1) rather than UTF-8.
//! Read as UTF-8, every accented letter in them turned into "�". This reads
//! each file in the encoding it was saved in, so Portuguese accents survive.

/// The text of a plain-text file, whatever encoding it was saved in:
/// - a byte-order mark (UTF-8, UTF-16 LE or BE) says the encoding outright;
/// - otherwise text that is valid UTF-8 is UTF-8 (pure ASCII included);
/// - anything else is read as Windows-1252, the encoding Windows used for
///   Portuguese text before UTF-8.
pub fn decode_text(bytes: &[u8]) -> String {
    if let Some((encoding, bom_len)) = encoding_rs::Encoding::for_bom(bytes) {
        let (text, _) = encoding.decode_without_bom_handling(&bytes[bom_len..]);
        return text.into_owned();
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_owned(),
        Err(_) => encoding_rs::WINDOWS_1252.decode_without_bom_handling(bytes).0.into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::decode_text;

    const SENTENCE: &str = "Ação, coração e órgão: não há perda de acentos.";

    #[test]
    fn utf8_text_is_kept_as_is() {
        assert_eq!(decode_text(SENTENCE.as_bytes()), SENTENCE);
    }

    #[test]
    fn utf8_byte_order_mark_is_not_part_of_the_text() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(SENTENCE.as_bytes());
        assert_eq!(decode_text(&bytes), SENTENCE);
    }

    #[test]
    fn old_windows_encoding_keeps_portuguese_accents() {
        let (bytes, _, _) = encoding_rs::WINDOWS_1252.encode(SENTENCE);
        assert!(std::str::from_utf8(&bytes).is_err(), "the sample must not be valid UTF-8");
        assert_eq!(decode_text(&bytes), SENTENCE);
    }

    #[test]
    fn utf16_with_byte_order_mark_is_read() {
        let mut bytes = vec![0xFF, 0xFE];
        for unit in SENTENCE.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        assert_eq!(decode_text(&bytes), SENTENCE);
    }
}
