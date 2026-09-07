use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};
pub fn flags(
    args: impl IntoIterator<Item = String>,
    values: &[&str],
    bools: &[&str],
) -> Result<BTreeMap<String, String>, &'static str> {
    let mut result = BTreeMap::new();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let Some(key) = arg.strip_prefix('-') else {
            return Err("unexpected positional argument");
        };
        let key = key.strip_prefix('-').unwrap_or(key);
        let (key, inline) = key
            .split_once('=')
            .map_or((key, None), |(k, v)| (k, Some(v)));
        if matches!(key, "h" | "help") && inline.is_none() {
            return Err("help requested");
        }
        let value = if values.contains(&key) {
            inline
                .map(str::to_owned)
                .or_else(|| args.next())
                .ok_or("missing flag value")?
        } else if bools.contains(&key) {
            match inline.unwrap_or("true") {
                "1" | "t" | "T" | "TRUE" | "true" | "True" => "true".into(),
                "0" | "f" | "F" | "FALSE" | "false" | "False" => "false".into(),
                _ => return Err("invalid boolean flag"),
            }
        } else {
            return Err("unknown flag");
        };
        if result.insert(key.into(), value).is_some() {
            return Err("duplicate flag");
        }
    }
    Ok(result)
}
/// Go duration syntax and signed nanosecond range, restricted to positive timeouts.
/// Each fractional component truncates independently, as time.ParseDuration does.
pub fn duration(s: &str) -> Result<Duration, &'static str> {
    let mut rest = s.strip_prefix('+').unwrap_or(s);
    let mut nanos = 0u64;
    while !rest.is_empty() {
        let (whole, tail) = duration_digits(rest);
        rest = tail;
        let fraction = if let Some(tail) = rest.strip_prefix('.') {
            let (fraction, tail) = duration_digits(tail);
            rest = tail;
            fraction
        } else {
            ""
        };
        if whole.is_empty() && fraction.is_empty() {
            return Err("invalid duration");
        }
        let end = rest
            .find(|c: char| c.is_ascii_digit() || c == '.')
            .unwrap_or(rest.len());
        let unit = match &rest[..end] {
            "ns" => 1,
            "us" | "µs" | "μs" => 1_000,
            "ms" => 1_000_000,
            "s" => 1_000_000_000,
            "m" => 60_000_000_000,
            "h" => 3_600_000_000_000,
            _ => return Err("invalid duration"),
        };
        rest = &rest[end..];
        let whole = if whole.is_empty() {
            0
        } else {
            whole.parse::<u64>().map_err(|_| "invalid duration")?
        };
        let component = whole
            .checked_mul(unit)
            .and_then(|n| n.checked_add(duration_fraction(fraction, unit)))
            .ok_or("invalid duration")?;
        nanos = nanos
            .checked_add(component)
            .filter(|n| *n <= i64::MAX as u64)
            .ok_or("invalid duration")?;
    }
    if nanos == 0 {
        return Err("duration must be positive");
    }
    Ok(Duration::from_nanos(nanos))
}
fn duration_digits(s: &str) -> (&str, &str) {
    let end = s.bytes().take_while(u8::is_ascii_digit).count();
    s.split_at(end)
}
fn duration_fraction(digits: &str, unit: u64) -> u64 {
    // Match Go's bounded fractional significand and evaluation order. Arbitrarily
    // long decimal tails cannot overflow, or turn an accepted value into infinity.
    let mut significand = 0u64;
    let mut scale = 1f64;
    for digit in digits.bytes() {
        if significand > (i64::MAX as u64) / 10 {
            break;
        }
        let next = significand * 10 + u64::from(digit - b'0');
        if next > 1u64 << 63 {
            break;
        }
        significand = next;
        scale *= 10.;
    }
    (significand as f64 * (unit as f64 / scale)) as u64
}
pub fn discover(
    root: &std::path::Path,
    reg: &appcall_connectors::Registry,
    filter: &str,
) -> Result<Vec<crate::qa::ScenarioFile>, &'static str> {
    if !filter.is_empty() {
        reg.connector(filter).map_err(|_| "unknown connector")?;
    }
    let mut pending = vec![root.to_owned()];
    let mut found = BTreeMap::new();
    let mut count = 0;
    while let Some(dir) = pending.pop() {
        for entry in std::fs::read_dir(dir).map_err(|_| "scenario discovery failed")? {
            let entry = entry.map_err(|_| "scenario discovery failed")?;
            count += 1;
            if count > 100_000 {
                return Err("scenario discovery limit exceeded");
            };
            let kind = entry.file_type().map_err(|_| "scenario discovery failed")?;
            if kind.is_dir() {
                pending.push(entry.path());
            } else if kind.is_file() && entry.file_name() == "qa.json" {
                let raw = read_bounded(&entry.path(), 4 * 1024 * 1024)?;
                let file: crate::qa::ScenarioFile =
                    serde_json::from_slice(&raw).map_err(|_| "invalid scenario JSON")?;
                validate(&file)?;
                reg.connector(&file.connector)
                    .map_err(|_| "unknown scenario connector")?;
                if found.insert(file.connector.clone(), file).is_some() {
                    return Err("duplicate scenario connector");
                };
            }
        }
    }
    Ok(reg
        .list()
        .filter(|c| filter.is_empty() || c.manifest().key == filter)
        .map(|c| {
            found
                .remove(&c.manifest().key)
                .unwrap_or(crate::qa::ScenarioFile {
                    connector: c.manifest().key.clone(),
                    scenarios: vec![],
                })
        })
        .collect())
}
pub fn read_bounded(path: &std::path::Path, limit: usize) -> Result<Vec<u8>, &'static str> {
    use std::io::Read;
    let mut bytes = vec![];
    std::fs::File::open(path)
        .map_err(|_| "file read failed")?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "file read failed")?;
    if bytes.len() > limit {
        return Err("file exceeds size limit");
    };
    Ok(bytes)
}
fn validate(f: &crate::qa::ScenarioFile) -> Result<(), &'static str> {
    if f.connector.trim().is_empty() {
        return Err("missing connector");
    };
    let mut names = BTreeSet::new();
    for s in &f.scenarios {
        if s.name.trim().is_empty()
            || !names.insert(&s.name)
            || s.operation.trim().is_empty()
            || !matches!(s.expect.status.as_str(), "ok" | "error")
        {
            return Err("invalid scenario");
        };
        if s.setup
            .iter()
            .chain(&s.teardown)
            .any(|s| s.operation.trim().is_empty())
        {
            return Err("invalid scenario step");
        };
        for a in &s.expect.assertions {
            if a.path.trim().is_empty()
                || !matches!(
                    a.op.as_str(),
                    "exists"
                        | "eq"
                        | "neq"
                        | "matches"
                        | "isArray"
                        | "isObject"
                        | "type"
                        | "len"
                        | "gt"
                        | "lt"
                )
            {
                return Err("invalid assertion");
            };
        }
    }
    Ok(())
}
pub fn manifest_root() -> Result<std::path::PathBuf, &'static str> {
    let mut p = std::env::current_dir().map_err(|_| "current directory unavailable")?;
    loop {
        let candidate = p.join("runner/connectors");
        if candidate.is_dir() {
            return Ok(candidate);
        };
        if !p.pop() {
            return Err("manifest root not found");
        }
    }
}
