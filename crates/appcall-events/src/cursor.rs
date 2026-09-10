use crate::{Error, Event, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, SecondsFormat, Utc};
pub enum Cursor {
    Position(i64),
    Time(DateTime<Utc>, String),
}
pub fn stream_cursor_at(position: i64, id: &str) -> String {
    URL_SAFE_NO_PAD.encode(format!("v2|{position}|{id}"))
}
pub fn stream_cursor(event: &Event) -> String {
    stream_cursor_at(event.stream_position, &event.id)
}
pub fn history_cursor(event: &Event) -> String {
    URL_SAFE_NO_PAD.encode(format!(
        "{}|{}",
        event
            .created_at
            .to_rfc3339_opts(SecondsFormat::AutoSi, true),
        event.id
    ))
}
pub fn decode(cursor: &str) -> Result<Cursor> {
    if cursor.len() > 4096 {
        return Err(Error::Invalid);
    }
    let raw = URL_SAFE_NO_PAD.decode(cursor).map_err(|_| Error::Invalid)?;
    let raw = std::str::from_utf8(&raw).map_err(|_| Error::Invalid)?;
    if let Some(rest) = raw.strip_prefix("v2|") {
        let (n, id) = rest.split_once('|').ok_or(Error::Invalid)?;
        let n = n.parse::<i64>().map_err(|_| Error::Invalid)?;
        if n <= 0 || id.is_empty() {
            return Err(Error::Invalid);
        }
        return Ok(Cursor::Position(n));
    }
    let (time, id) = raw.split_once('|').ok_or(Error::Invalid)?;
    if id.is_empty() {
        return Err(Error::Invalid);
    }
    Ok(Cursor::Time(
        DateTime::parse_from_rfc3339(time)
            .map_err(|_| Error::Invalid)?
            .with_timezone(&Utc),
        id.into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn go_cursor_formats_and_invalid_inputs() {
        assert!(matches!(
            decode(&URL_SAFE_NO_PAD.encode("v2|123|event")),
            Ok(Cursor::Position(123))
        ));
        match decode(&URL_SAFE_NO_PAD.encode("2026-09-07T12:34:56.123456789Z|event")).unwrap() {
            Cursor::Time(time, id) => {
                assert_eq!(time.timestamp_subsec_nanos(), 123456789);
                assert_eq!(id, "event");
            }
            _ => panic!("expected timestamp cursor"),
        }
        for raw in [
            "v2|0|event",
            "v2|-1|event",
            "v2|1|",
            "v2|9223372036854775808|event",
            "invalid|id",
            "2026-09-07T12:34:56Z|",
        ] {
            assert!(decode(&URL_SAFE_NO_PAD.encode(raw)).is_err());
        }
        assert!(decode("%%%").is_err());
        assert!(decode(&"x".repeat(4097)).is_err());
    }
}
