use crate::{ActionError, Result};
use serde_json::Value;
use sha2::{Digest, Sha256};

// Go encoding/json unmarshals numbers as float64, sorts object keys, escapes
// HTML and U+2028/U+2029, and emits shortest floats in fixed form in [1e-6,1e21).
// Preserve that wire digest so Go and Rust cannot disagree on an existing key.
pub fn scoped_input_hash(input: &Value, brand: &str) -> Result<String> {
    let raw = canonical(input)?;
    let hash = format!("{:x}", Sha256::digest(raw.as_bytes()));
    if brand.is_empty() {
        return Ok(hash);
    }
    let scope = canonical(&serde_json::json!([brand, hash]))?;
    Ok(format!("scope-v1:{:x}", Sha256::digest(scope.as_bytes())))
}
fn string(value: &str) -> String {
    serde_json::to_string(value)
        .expect("strings serialize")
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}
fn canonical(value: &Value) -> Result<String> {
    Ok(match value {
        Value::Null => "null".into(),
        Value::Bool(v) => v.to_string(),
        Value::String(v) => string(v),
        Value::Number(v) => {
            // Go decodes integers through float64. Rust keeps integer precision;
            // reject values that could otherwise share a hash but dispatch differently.
            let unsafe_integer = v.as_u64().is_some_and(|n| n > 9_007_199_254_740_992)
                || v.as_i64().is_some_and(|n| n < -9_007_199_254_740_992);
            if unsafe_integer {
                return Err(ActionError::new("INVALID_ACTION_INPUT"));
            }
            number(
                v.as_f64()
                    .ok_or_else(|| ActionError::new("INVALID_ACTION_INPUT"))?,
            )?
        }
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(canonical)
                .collect::<Result<Vec<_>>>()?
                .join(",")
        ),
        Value::Object(values) => {
            let mut keys: Vec<_> = values.keys().collect();
            keys.sort();
            let fields = keys
                .into_iter()
                .map(|k| Ok(format!("{}:{}", string(k), canonical(&values[k])?)))
                .collect::<Result<Vec<_>>>()?;
            format!("{{{}}}", fields.join(","))
        }
    })
}
fn number(value: f64) -> Result<String> {
    if !value.is_finite() {
        return Err(ActionError::new("INVALID_ACTION_INPUT"));
    }
    if value == 0.0 {
        return Ok(if value.is_sign_negative() { "-0" } else { "0" }.into());
    }
    let negative = value.is_sign_negative();
    let abs = value.abs();
    let repr = abs.to_string();
    let (mantissa, exponent) = match repr.split_once(['e', 'E']) {
        Some((m, e)) => (
            m,
            e.parse::<i32>()
                .map_err(|_| ActionError::new("INVALID_ACTION_INPUT"))?,
        ),
        None => (repr.as_str(), 0),
    };
    let point = mantissa.find('.').unwrap_or(mantissa.len()) as i32;
    let mut digits = mantissa.replace('.', "");
    let leading = digits.bytes().take_while(|c| *c == b'0').count();
    digits.drain(..leading);
    let decimal = point + exponent - leading as i32;
    while digits.len() > 1 && digits.ends_with('0') {
        digits.pop();
    }
    let mut result = String::new();
    if negative {
        result.push('-')
    }
    if !(1e-6..1e21).contains(&abs) {
        result.push_str(&digits[..1]);
        if digits.len() > 1 {
            result.push('.');
            result.push_str(&digits[1..])
        }
        let exp = decimal - 1;
        result.push('e');
        if exp >= 0 {
            result.push('+')
        }
        result.push_str(&exp.to_string())
    } else if decimal <= 0 {
        result.push_str("0.");
        result.push_str(&"0".repeat((-decimal) as usize));
        result.push_str(&digits)
    } else if decimal as usize >= digits.len() {
        result.push_str(&digits);
        result.push_str(&"0".repeat(decimal as usize - digits.len()))
    } else {
        result.push_str(&digits[..decimal as usize]);
        result.push('.');
        result.push_str(&digits[decimal as usize..])
    }
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn go_canonical_numbers_html_and_sorting() {
        let input: Value =
            serde_json::from_str(r#"{"z":"<>&","a":1.0,"b":1e-7,"c":1e21,"d":0.000001,"e":-0.0}"#)
                .unwrap();
        assert_eq!(
            canonical(&input).unwrap(),
            r#"{"a":1,"b":1e-7,"c":1e+21,"d":0.000001,"e":-0,"z":"\u003c\u003e\u0026"}"#
        )
    }
    #[test]
    fn unsafe_integer_precision_is_rejected_before_it_can_alias_a_cache_key() {
        assert!(
            scoped_input_hash(&serde_json::json!({"id":9007199254740993_u64}), "brand").is_err()
        );
        assert!(
            scoped_input_hash(&serde_json::json!({"id":9007199254740992_u64}), "brand").is_ok()
        );
    }
    #[test]
    fn scope_changes_identity() {
        let v = serde_json::json!({"a":1});
        assert_ne!(
            scoped_input_hash(&v, "a").unwrap(),
            scoped_input_hash(&v, "b").unwrap()
        );
        assert_eq!(
            scoped_input_hash(&v, "").unwrap(),
            "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862"
        );
    }
}
