use crate::{Error, ErrorCode, Operation, Result};
use serde_json::Value;
impl Operation {
    pub fn validate_input(&self, input: &Value) -> Result<()> {
        validate_optional(&self.input_schema, input, ErrorCode::InvalidInput)
    }
    pub fn validate_output(&self, output: &Value) -> Result<()> {
        validate_optional(&self.output_schema, output, ErrorCode::InvalidOutput)
    }
}
fn validate_optional(schema: &Option<Value>, value: &Value, code: ErrorCode) -> Result<()> {
    match schema {
        None => Ok(()),
        Some(schema) => {
            check_schema(schema, 0)?;
            validate(schema, value, code, 0)
        }
    }
}
fn check_schema(schema: &Value, depth: usize) -> Result<()> {
    if depth > 64 {
        return Err(Error::new(ErrorCode::UnsupportedSchema));
    }
    if schema.is_boolean() {
        return Ok(());
    }
    let map = schema
        .as_object()
        .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?;
    for key in map.keys() {
        if !matches!(
            key.as_str(),
            "type"
                | "properties"
                | "required"
                | "items"
                | "additionalProperties"
                | "enum"
                | "minLength"
                | "minItems"
                | "description"
                | "title"
                | "default"
                | "examples"
                | "$schema"
                | "$id"
                | "$comment"
                | "readOnly"
                | "writeOnly"
                | "deprecated"
        ) && !key.starts_with("x-")
        {
            return Err(Error::new(ErrorCode::UnsupportedSchema));
        }
    }
    if let Some(kind) = map.get("type") {
        if let Some(kind) = kind.as_str() {
            matches_type(kind, &Value::Null)?;
        } else {
            let kinds = kind
                .as_array()
                .filter(|k| !k.is_empty())
                .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?;
            for kind in kinds {
                matches_type(
                    kind.as_str()
                        .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?,
                    &Value::Null,
                )?;
            }
        }
    }
    if let Some(properties) = map.get("properties") {
        for child in properties
            .as_object()
            .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?
            .values()
        {
            check_schema(child, depth + 1)?;
        }
    }
    for key in ["items", "additionalProperties"] {
        if let Some(child) = map.get(key) {
            check_schema(child, depth + 1)?;
        }
    }
    if let Some(required) = map.get("required") {
        if !required
            .as_array()
            .is_some_and(|r| r.iter().all(Value::is_string))
        {
            return Err(Error::new(ErrorCode::UnsupportedSchema));
        }
    }
    if let Some(values) = map.get("enum") {
        if values.as_array().is_none_or(|v| v.is_empty()) {
            return Err(Error::new(ErrorCode::UnsupportedSchema));
        }
    }
    for key in ["minItems", "minLength"] {
        if let Some(min) = map.get(key) {
            if min.as_u64().is_none() {
                return Err(Error::new(ErrorCode::UnsupportedSchema));
            }
        }
    }
    Ok(())
}
fn validate(schema: &Value, value: &Value, code: ErrorCode, depth: usize) -> Result<()> {
    if depth > 64 {
        return Err(Error::new(ErrorCode::UnsupportedSchema));
    }
    if let Some(flag) = schema.as_bool() {
        return if flag { Ok(()) } else { Err(Error::new(code)) };
    }
    let map = schema
        .as_object()
        .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?;
    if let Some(kind) = map.get("type") {
        let valid = if let Some(k) = kind.as_str() {
            matches_type(k, value)?
        } else if let Some(types) = kind.as_array() {
            let mut any = false;
            for k in types {
                any |= matches_type(
                    k.as_str()
                        .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?,
                    value,
                )?;
            }
            any
        } else {
            return Err(Error::new(ErrorCode::UnsupportedSchema));
        };
        if !valid {
            return Err(Error::new(code));
        }
    }
    if let Some(values) = map.get("enum") {
        if !values
            .as_array()
            .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?
            .iter()
            .any(|allowed| equal_json(allowed, value))
        {
            return Err(Error::new(code));
        }
    }
    if let Some(obj) = value.as_object() {
        if let Some(required) = map.get("required") {
            for name in required
                .as_array()
                .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?
            {
                if !obj.contains_key(
                    name.as_str()
                        .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?,
                ) {
                    return Err(Error::new(code));
                }
            }
        }
        let properties = map
            .get("properties")
            .map(|p| {
                p.as_object()
                    .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))
            })
            .transpose()?;
        for (name, child) in obj {
            if let Some(sub) = properties.and_then(|p| p.get(name)) {
                validate(sub, child, code, depth + 1)?;
            } else if let Some(additional) = map.get("additionalProperties") {
                validate(additional, child, code, depth + 1)?;
            }
        }
    }
    if let Some(array) = value.as_array() {
        if let Some(min) = map.get("minItems") {
            if array.len()
                < (min
                    .as_u64()
                    .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?
                    as usize)
            {
                return Err(Error::new(code));
            }
        }
        if let Some(items) = map.get("items") {
            for item in array {
                validate(items, item, code, depth + 1)?;
            }
        }
    }
    if let Some(string) = value.as_str() {
        if let Some(min) = map.get("minLength") {
            if string.chars().count()
                < (min
                    .as_u64()
                    .ok_or_else(|| Error::new(ErrorCode::UnsupportedSchema))?
                    as usize)
            {
                return Err(Error::new(code));
            }
        }
    }
    Ok(())
}

// JSON Schema numeric equality treats 1 and 1.0 alike. Comparing via f64 would
// incorrectly equate neighboring large integer identifiers, so normalize the
// finite decimal representations without lossy integer-to-float conversion.
fn equal_json(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => decimal_key(a) == decimal_key(b),
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| equal_json(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .all(|(key, a)| b.get(key).is_some_and(|b| equal_json(a, b)))
        }
        _ => a == b,
    }
}

fn decimal_key(number: &serde_json::Number) -> (bool, String, i32) {
    let text = number.to_string();
    let (negative, unsigned) = text
        .strip_prefix('-')
        .map_or((false, text.as_str()), |s| (true, s));
    let (mantissa, exponent) = unsigned
        .split_once(['e', 'E'])
        .map_or((unsigned, 0), |(m, e)| {
            (m, e.parse::<i32>().expect("serde number exponent"))
        });
    let fraction = mantissa.split_once('.').map_or(0, |(_, f)| f.len());
    let digits = mantissa.replace('.', "");
    let digits = digits.trim_start_matches('0');
    if digits.is_empty() {
        return (false, "0".into(), 0);
    }
    let significant = digits.trim_end_matches('0');
    (
        negative,
        significant.into(),
        exponent - fraction as i32 + (digits.len() - significant.len()) as i32,
    )
}
fn matches_type(kind: &str, value: &Value) -> Result<bool> {
    Ok(match kind {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "number" => value.is_number(),
        "integer" => {
            value.is_i64() || value.is_u64() || value.as_f64().is_some_and(|n| n.fract() == 0.0)
        }
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        _ => return Err(Error::new(ErrorCode::UnsupportedSchema)),
    })
}
