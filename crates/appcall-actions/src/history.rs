//! Replay captures original caller input only after validated success. Credential
//! names and actual resolved values are removed before persistence.
use serde_json::{Map, Value};
const REDACTED: &str = "[REDACTED]";

pub(crate) fn credential_values(fields: &Map<String, Value>, caller: &str) -> Option<Vec<String>> {
    fn collect(v: &Value, out: &mut Vec<String>, depth: usize) -> bool {
        if depth > 32 || out.len() > 128 {
            return false;
        }
        match v {
            Value::String(s) if !s.is_empty() => {
                out.push(s.clone());
                out.len() <= 128
            }
            Value::Object(fields) => fields.values().all(|v| collect(v, out, depth + 1)),
            Value::Array(values) => values.iter().all(|v| collect(v, out, depth + 1)),
            _ => true,
        }
    }
    let mut values = Vec::new();
    if !caller.is_empty() {
        values.push(caller.to_owned());
    }
    fields
        .values()
        .all(|v| collect(v, &mut values, 0))
        .then_some(values)
}
pub(crate) fn secret_variants(secrets: &[&str]) -> Vec<String> {
    let mut variants = Vec::new();
    for value in secrets.iter().filter(|v| !v.is_empty()) {
        variants.push((*value).to_owned());
        if let Ok(encoded) = serde_json::to_string(value) {
            variants.push(encoded[1..encoded.len() - 1].to_owned());
        }
        let encoded: String = url::form_urlencoded::byte_serialize(value.as_bytes()).collect();
        variants.push(encoded.replace('+', "%20"));
        variants.push(encoded);
    }
    let lowercase: Vec<_> = variants
        .iter()
        .map(|value| {
            let mut bytes = value.as_bytes().to_vec();
            for i in 0..bytes.len().saturating_sub(2) {
                if bytes[i] == b'%' {
                    bytes[i + 1] = bytes[i + 1].to_ascii_lowercase();
                    bytes[i + 2] = bytes[i + 2].to_ascii_lowercase();
                }
            }
            String::from_utf8(bytes).expect("ASCII edits preserve UTF-8")
        })
        .collect();
    variants.extend(lowercase);
    variants.sort_by_key(|v| std::cmp::Reverse(v.len()));
    variants.dedup();
    variants
}
fn normalized(key: &str) -> String {
    key.chars()
        .filter(|c| !matches!(c, '_' | '-' | '.'))
        .flat_map(char::to_lowercase)
        .collect()
}
fn credential_field(key: &str, fields: &[String]) -> bool {
    let key = normalized(key);
    fields.iter().any(|f| normalized(f) == key)
        || [
            "apikey",
            "token",
            "authorization",
            "cookie",
            "password",
            "secret",
            "credential",
        ]
        .iter()
        .any(|part| key.contains(part))
}
/// Fail closed on excessive nesting/secret counts. Values preserve valid JSON,
/// even when credentials contain quotes or appear in nested string values/keys.
pub fn sanitize_replay_input(
    input: &Value,
    connector: &str,
    fields: &[String],
    secrets: Option<&[String]>,
) -> Value {
    let Some(secrets) = secrets else {
        return Value::Null;
    };
    if secrets.len() > 128 {
        return Value::Null;
    }
    let refs: Vec<_> = secrets.iter().map(String::as_str).collect();
    let variants = secret_variants(&refs);
    fn text(value: &str, variants: &[String]) -> String {
        variants.iter().fold(value.to_owned(), |out, secret| {
            out.replace(secret, REDACTED)
        })
    }
    fn clean(
        value: &Value,
        connector: &str,
        fields: &[String],
        variants: &[String],
        depth: usize,
    ) -> Value {
        if depth > 32 {
            return Value::Null;
        }
        match value {
            Value::Object(map) => Value::Object(
                map.iter()
                    .filter(|(key, _)| !(connector == "unipile" && key.as_str() == "account_id"))
                    .map(|(key, value)| {
                        let value = if credential_field(key, fields) {
                            Value::String(REDACTED.into())
                        } else {
                            clean(value, connector, fields, variants, depth + 1)
                        };
                        (text(key, variants), value)
                    })
                    .collect(),
            ),
            Value::Array(values) => Value::Array(
                values
                    .iter()
                    .map(|v| clean(v, connector, fields, variants, depth + 1))
                    .collect(),
            ),
            Value::String(value) => Value::String(text(value, variants)),
            _ => value.clone(),
        }
    }
    clean(input, connector, fields, &variants, 0)
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn replay_strips_arbitrary_credential_names_and_nested_secret_values() {
        let input = json!({"customKey":"forged","account_id":"other-brand","nested":{"message":"real/key and real%2Fkey","password":"forged"},"text":"keep"});
        let result = sanitize_replay_input(
            &input,
            "unipile",
            &["customKey".into()],
            Some(&["real/key".into()]),
        );
        assert_eq!(
            result,
            json!({"customKey":"[REDACTED]","nested":{"message":"[REDACTED] and [REDACTED]","password":"[REDACTED]"},"text":"keep"})
        );
        assert_eq!(input["account_id"], "other-brand");
    }
    #[test]
    fn unavailable_secret_scan_erases_input() {
        assert_eq!(
            sanitize_replay_input(&json!({"text":"secret"}), "x", &[], None),
            Value::Null
        );
    }
}
