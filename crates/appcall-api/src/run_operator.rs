//! Server-owned authorization policy for the browser Runs controls.
//!
//! The grant set is deliberately independent from Anusa membership roles and
//! API keys.  It contains only exact `(projectId, userId)` pairs and is
//! evaluated after the browser identity has freshly verified membership.

use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
};

pub const ENV_KEY: &str = "APPCALL_RUN_OPERATOR_GRANTS";
const MAX_BYTES: usize = 16 * 1024;
const MAX_ENTRIES: usize = 128;
const MAX_ID_BYTES: usize = 256;

#[derive(Clone, Default, PartialEq, Eq)]
pub struct RunOperatorGrants {
    pairs: BTreeSet<(String, String)>,
}

// Never include configured project or user IDs in logs/debug output.
impl fmt::Debug for RunOperatorGrants {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RunOperatorGrants")
            .field("entry_count", &self.pairs.len())
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunOperatorError {
    TooLarge,
    InvalidJson,
    InvalidEntry,
    TooManyEntries,
    DuplicateEntry,
}

impl fmt::Display for RunOperatorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TooLarge => "Runs operator grants exceed the configuration limit",
            Self::InvalidJson => "Runs operator grants have invalid JSON",
            Self::InvalidEntry => "Runs operator grants contain an invalid exact identity",
            Self::TooManyEntries => "Runs operator grants exceed the entry limit",
            Self::DuplicateEntry => "Runs operator grants contain a duplicate identity",
        })
    }
}

impl std::error::Error for RunOperatorError {}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ConfiguredPair {
    project_id: String,
    user_id: String,
}

impl RunOperatorGrants {
    /// Read the process environment once at application-state capture time.
    pub fn from_env() -> Result<Self, RunOperatorError> {
        match std::env::var(ENV_KEY) {
            Ok(raw) => Self::from_json(&raw),
            Err(std::env::VarError::NotPresent) => Ok(Self::default()),
            Err(std::env::VarError::NotUnicode(_)) => Err(RunOperatorError::InvalidJson),
        }
    }

    /// Parse a supplied environment map without mutating process-global state.
    pub fn from_map(env: &BTreeMap<String, String>) -> Result<Self, RunOperatorError> {
        Self::from_json(env.get(ENV_KEY).map(String::as_str).unwrap_or(""))
    }

    /// Parse the bounded JSON allowlist. Blank or missing configuration is
    /// intentionally the empty, deny-all policy.
    pub fn from_json(raw: &str) -> Result<Self, RunOperatorError> {
        if raw.len() > MAX_BYTES {
            return Err(RunOperatorError::TooLarge);
        }
        let raw = raw.trim();
        if raw.is_empty() {
            return Ok(Self::default());
        }
        let entries: Vec<ConfiguredPair> =
            serde_json::from_str(raw).map_err(|_| RunOperatorError::InvalidJson)?;
        if entries.len() > MAX_ENTRIES {
            return Err(RunOperatorError::TooManyEntries);
        }
        let mut pairs = BTreeSet::new();
        for entry in entries {
            if !valid_exact_id(&entry.project_id) || !valid_exact_id(&entry.user_id) {
                return Err(RunOperatorError::InvalidEntry);
            }
            if !pairs.insert((entry.project_id, entry.user_id)) {
                return Err(RunOperatorError::DuplicateEntry);
            }
        }
        Ok(Self { pairs })
    }

    pub fn permits(&self, project_id: &str, user_id: Option<&str>) -> bool {
        user_id.is_some_and(|user_id| {
            self.pairs
                .contains(&(project_id.to_owned(), user_id.to_owned()))
        })
    }

    pub fn is_empty(&self) -> bool {
        self.pairs.is_empty()
    }
}

fn valid_exact_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ID_BYTES
        && !value.chars().any(|c| c.is_control() || c.is_whitespace())
        && !value.chars().any(|c| matches!(c, '*' | '?' | '[' | ']'))
}

#[cfg(test)]
mod tests {
    use super::RunOperatorGrants;
    use std::collections::BTreeMap;

    const ENV: &str = "APPCALL_RUN_OPERATOR_GRANTS";

    fn configured(raw: &str) -> Result<RunOperatorGrants, impl std::fmt::Debug> {
        RunOperatorGrants::from_map(&BTreeMap::from([(ENV.to_owned(), raw.to_owned())]))
    }

    #[test]
    fn missing_and_empty_configuration_are_deny_all() {
        let missing = RunOperatorGrants::from_map(&BTreeMap::new()).unwrap();
        assert!(!missing.permits("proj-a", Some("user-a")));
        assert!(!missing.permits("proj-a", None));

        let empty = configured(" ").unwrap();
        assert!(!empty.permits("proj-a", Some("user-a")));
    }

    #[test]
    fn only_the_exact_project_and_authenticated_user_pair_matches() {
        let grants = configured(
            r#"[{"projectId":"proj-a","userId":"user-a"},{"projectId":"proj-b","userId":"user-b"}]"#,
        )
        .unwrap();

        assert!(grants.permits("proj-a", Some("user-a")));
        assert!(grants.permits("proj-b", Some("user-b")));
        assert!(!grants.permits("proj-a", Some("user-b")));
        assert!(!grants.permits("proj-b", Some("user-a")));
        assert!(!grants.permits("proj-a", None));
        assert!(!grants.permits("proj-other", Some("user-a")));
    }

    #[test]
    fn invalid_shape_ids_and_duplicate_pairs_fail_closed() {
        let invalid = [
            "not-json",
            r#"{"projectId":"proj-a"}"#,
            r#"{"userId":"user-a"}"#,
            r#"[{"projectId":"","userId":"user-a"}]"#,
            r#"[{"projectId":"proj a","userId":"user-a"}]"#,
            r#"[{"projectId":"proj-a","userId":" user-a"}]"#,
            r#"[{"projectId":"*","userId":"user-a"}]"#,
            r#"[{"projectId":"proj-*","userId":"user-a"}]"#,
            r#"[{"projectId":"proj-a","userId":"*"}]"#,
            r#"[{"projectId":"proj-a","userId":"user-*"}]"#,
            r#"[{"projectId":"proj-a","userId":"user-a","role":"operator"}]"#,
            r#"[{"projectId":"proj-a","userId":"user-a"},{"projectId":"proj-a","userId":"user-a"}]"#,
        ];

        for raw in invalid {
            assert!(configured(raw).is_err(), "accepted invalid grants: {raw}");
        }

        let control = serde_json::json!([{
            "projectId": "proj-a",
            "userId": "user\u{0000}a"
        }])
        .to_string();
        assert!(configured(&control).is_err());
    }

    #[test]
    fn grant_count_and_json_bytes_are_bounded() {
        let entries = (0..128)
            .map(|n| {
                serde_json::json!({
                    "projectId": format!("proj-{n}"),
                    "userId": format!("user-{n}")
                })
            })
            .collect::<Vec<_>>();
        let accepted = serde_json::to_string(&entries).unwrap();
        let grants = configured(&accepted).unwrap();
        assert!(grants.permits("proj-127", Some("user-127")));

        let mut too_many_entries = entries;
        too_many_entries.push(serde_json::json!({
            "projectId": "proj-over",
            "userId": "user-over"
        }));
        let too_many = serde_json::to_string(&too_many_entries).unwrap();
        assert!(configured(&too_many).is_err());

        let too_large = format!("{}{}", accepted, " ".repeat(16 * 1024));
        assert!(configured(&too_large).is_err());
    }

    #[test]
    fn configuration_errors_do_not_echo_allowlist_contents() {
        let raw = r#"[{"projectId":"secret-project","userId":"secret-user","role":"operator"}]"#;
        let error = configured(raw).unwrap_err();
        let debug = format!("{error:?}");
        assert!(!debug.contains("secret-project"));
        assert!(!debug.contains("secret-user"));
        assert!(!debug.contains("operator"));
    }

    #[test]
    fn duplicate_json_object_fields_fail_closed() {
        let raw = r#"[{"projectId":"proj-a","projectId":"proj-b","userId":"user-a"}]"#;
        assert!(configured(raw).is_err());
    }

    #[test]
    fn grant_debug_reports_only_entry_count() {
        let grants =
            configured(r#"[{"projectId":"secret-project","userId":"secret-user"}]"#).unwrap();
        let debug = format!("{grants:?}");
        assert!(debug.contains("entry_count"));
        assert!(debug.contains('1'));
        assert!(!debug.contains("secret-project"));
        assert!(!debug.contains("secret-user"));
    }
}
