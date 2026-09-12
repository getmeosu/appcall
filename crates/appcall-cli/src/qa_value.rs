use crate::qa::Assertion;
use regex::Regex;
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::BTreeMap;
pub fn expand(v: &Value, vars: &BTreeMap<String, Value>) -> Value {
    match v {
        Value::String(s) => {
            let re = Regex::new(r"\{\{([^}]+)\}\}").expect("constant regex");
            if let Some(c) = re.captures(s) {
                if c.get(0).unwrap().as_str() == s {
                    if let Some(v) = vars.get(c[1].trim()) {
                        return v.clone();
                    }
                }
            }
            Value::String(
                re.replace_all(s, |c: &regex::Captures<'_>| {
                    vars.get(c[1].trim())
                        .map(|v| {
                            v.as_str()
                                .map(str::to_owned)
                                .unwrap_or_else(|| v.to_string())
                        })
                        .unwrap_or_else(|| c[0].to_owned())
                })
                .into_owned(),
            )
        }
        Value::Array(a) => Value::Array(a.iter().map(|v| expand(v, vars)).collect()),
        Value::Object(m) => Value::Object(
            m.iter()
                .map(|(k, v)| (k.clone(), expand(v, vars)))
                .collect(),
        ),
        _ => v.clone(),
    }
}
pub fn capture(v: &Value, prefix: &str, vars: &mut BTreeMap<String, Value>) {
    if !prefix.is_empty() {
        vars.insert(prefix.into(), v.clone());
    }
    match v {
        Value::Object(m) => {
            for (k, v) in m {
                capture(
                    v,
                    &if prefix.is_empty() {
                        k.clone()
                    } else {
                        format!("{prefix}.{k}")
                    },
                    vars,
                )
            }
        }
        Value::Array(a) => {
            for (i, v) in a.iter().enumerate() {
                capture(v, &format!("{prefix}.{i}"), vars)
            }
        }
        _ => {}
    }
}
pub fn check_assertion(output: &Value, a: &Assertion) -> bool {
    let value = a
        .path
        .split('.')
        .try_fold(output, |v, k| v.as_object()?.get(k));
    if a.op == "exists" {
        return value.is_some();
    }
    let Some(v) = value else { return false };
    match a.op.as_str() {
        "eq" => equal(v, &a.value),
        "neq" => !equal(v, &a.value),
        "matches" => v
            .as_str()
            .zip(a.value.as_str())
            .is_some_and(|(s, r)| Regex::new(r).is_ok_and(|r| r.is_match(s))),
        "isArray" => v.is_array(),
        "isObject" => v.is_object(),
        "type" => {
            a.value.as_str()
                == Some(match v {
                    Value::Null => "null",
                    Value::Bool(_) => "boolean",
                    Value::Number(_) => "number",
                    Value::String(_) => "string",
                    Value::Array(_) => "array",
                    Value::Object(_) => "object",
                })
        }
        "len" => {
            let len = match v {
                Value::String(s) => Some(s.len()),
                Value::Array(a) => Some(a.len()),
                Value::Object(m) => Some(m.len()),
                _ => None,
            };
            len.and_then(|n| compare_values(&Value::Number((n as u64).into()), &a.value))
                == Some(Ordering::Equal)
        }
        "gt" => compare_values(v, &a.value) == Some(Ordering::Greater),
        "lt" => compare_values(v, &a.value) == Some(Ordering::Less),
        _ => false,
    }
}
fn equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(_), Value::Number(_)) => compare_values(a, b) == Some(Ordering::Equal),
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| equal(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len() && a.iter().all(|(k, a)| b.get(k).is_some_and(|b| equal(a, b)))
        }
        _ => a == b,
    }
}

#[derive(Clone, Copy)]
enum Numeric {
    Integer(i128),
    Float(f64),
}

fn numeric(value: &Value) -> Option<Numeric> {
    let Value::Number(number) = value else {
        return None;
    };
    if let Some(value) = number.as_i64() {
        Some(Numeric::Integer(value as i128))
    } else if let Some(value) = number.as_u64() {
        Some(Numeric::Integer(value as i128))
    } else {
        number
            .as_f64()
            .filter(|value| value.is_finite())
            .map(Numeric::Float)
    }
}

fn compare_values(a: &Value, b: &Value) -> Option<Ordering> {
    match (numeric(a)?, numeric(b)?) {
        (Numeric::Integer(a), Numeric::Integer(b)) => Some(a.cmp(&b)),
        (Numeric::Float(a), Numeric::Float(b)) => a.partial_cmp(&b),
        (Numeric::Integer(a), Numeric::Float(b)) => compare_integer_float(a, b),
        (Numeric::Float(a), Numeric::Integer(b)) => {
            compare_integer_float(b, a).map(Ordering::reverse)
        }
    }
}

/// Compares an i128 with a finite f64 using the float's exact binary
/// significand and exponent. Converting either side to f64 would collapse
/// adjacent integers above 2^53, including valid JSON u64 values.
fn compare_integer_float(integer: i128, float: f64) -> Option<Ordering> {
    if !float.is_finite() {
        return None;
    }
    if float == 0.0 {
        return Some(integer.cmp(&0));
    }
    let integer_negative = integer < 0;
    let float_negative = float.is_sign_negative();
    if integer_negative != float_negative {
        return Some(if integer_negative {
            Ordering::Less
        } else {
            Ordering::Greater
        });
    }
    let magnitude = compare_unsigned_float(integer.unsigned_abs(), float.abs());
    Some(if integer_negative {
        magnitude.reverse()
    } else {
        magnitude
    })
}

fn compare_unsigned_float(integer: u128, float: f64) -> Ordering {
    if integer == 0 {
        return Ordering::Less;
    }
    let bits = float.to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as i32;
    let fraction = bits & ((1_u64 << 52) - 1);
    let (significand, shift) = if exponent == 0 {
        (fraction, -1074)
    } else {
        (fraction | (1_u64 << 52), exponent - 1023 - 52)
    };
    if shift >= 0 {
        let shift = shift as u32;
        let integer_bits = 128 - integer.leading_zeros();
        let float_bits = (64 - significand.leading_zeros()).saturating_add(shift);
        match integer_bits.cmp(&float_bits) {
            Ordering::Equal => return integer.cmp(&((significand as u128) << shift)),
            ordering => return ordering,
        }
    }
    let shift = (-shift) as u32;
    let integer_bits = 128 - integer.leading_zeros();
    let float_bits = 64 - significand.leading_zeros();
    let scaled_integer_bits = integer_bits.saturating_add(shift);
    match scaled_integer_bits.cmp(&float_bits) {
        Ordering::Equal => (integer << shift).cmp(&(significand as u128)),
        ordering => ordering,
    }
}
pub fn label(s: &str) -> String {
    s.chars()
        .take(160)
        .map(|c| {
            if c.is_ascii() && !c.is_control() {
                c
            } else {
                '?'
            }
        })
        .collect()
}
