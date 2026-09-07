use crate::qa::Assertion;
use regex::Regex;
use serde_json::Value;
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
    let num = |v: &Value| v.as_f64();
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
            len.zip(num(&a.value)).is_some_and(|(n, w)| n as f64 == w)
        }
        "gt" => num(v).zip(num(&a.value)).is_some_and(|(a, b)| a > b),
        "lt" => num(v).zip(num(&a.value)).is_some_and(|(a, b)| a < b),
        _ => false,
    }
}
fn equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => a.as_f64() == b.as_f64(),
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| equal(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len() && a.iter().all(|(k, a)| b.get(k).is_some_and(|b| equal(a, b)))
        }
        _ => a == b,
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
