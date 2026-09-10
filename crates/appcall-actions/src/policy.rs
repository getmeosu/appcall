use crate::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use sha2::Sha256;

#[derive(Clone, Default)]
pub struct Entitlements {
    pub action_calls_soft: i64,
    pub action_calls_hard: i64,
    pub send_cap: i64,
    pub spend_cap_micros: i64,
}
pub fn resolve_entitlements(
    record: Option<(&str, &str, Value)>,
    defaults: &Entitlements,
) -> Result<Entitlements> {
    let Some((plan, status, overrides)) = record else {
        return validate_entitlements(defaults.clone());
    };
    let (soft, hard, send) = match (plan, status) {
        ("starter", "active") => (2000, 2500, 50),
        ("growth", "active") => (10000, 12000, 200),
        _ => (200, 300, 0),
    };
    let mut result = Entitlements {
        action_calls_soft: soft,
        action_calls_hard: hard,
        send_cap: send,
        spend_cap_micros: 0,
    };
    if status == "active" {
        let map = overrides
            .as_object()
            .ok_or_else(|| ActionError::new("CONNECTOR_UNAVAILABLE"))?;
        for (key, target) in [
            ("action_calls_soft", &mut result.action_calls_soft),
            ("action_calls_hard", &mut result.action_calls_hard),
            ("send_cap", &mut result.send_cap),
            ("spend_cap_micros", &mut result.spend_cap_micros),
        ] {
            if let Some(value) = map.get(key).filter(|v| !v.is_null()) {
                *target = value
                    .as_i64()
                    .ok_or_else(|| ActionError::new("CONNECTOR_UNAVAILABLE"))?;
            }
        }
    }
    validate_entitlements(result)
}
fn validate_entitlements(e: Entitlements) -> Result<Entitlements> {
    if [
        e.action_calls_soft,
        e.action_calls_hard,
        e.send_cap,
        e.spend_cap_micros,
    ]
    .iter()
    .any(|n| *n < 0)
    {
        Err(ActionError::new("CONNECTOR_UNAVAILABLE"))
    } else {
        Ok(e)
    }
}
#[derive(Clone)]
pub struct LinkedInLimits {
    pub warmup_enabled: bool,
    pub invite_daily_cap: i64,
    pub invite_weekly_cap: i64,
    pub invite_noted_monthly_cap: i64,
    pub invite_spacing_seconds: i64,
    pub message_daily_cap: i64,
    pub message_weekly_cap: i64,
    pub message_spacing_seconds: i64,
    pub profile_view_daily_cap: i64,
}
impl Default for LinkedInLimits {
    fn default() -> Self {
        Self {
            warmup_enabled: true,
            invite_daily_cap: 0,
            invite_weekly_cap: 0,
            invite_noted_monthly_cap: 0,
            invite_spacing_seconds: 0,
            message_daily_cap: 0,
            message_weekly_cap: 0,
            message_spacing_seconds: 0,
            profile_view_daily_cap: 0,
        }
    }
}
#[derive(Clone, Default, Debug, PartialEq, Eq)]
pub struct Ceiling {
    pub hour: i64,
    pub day: i64,
    pub week: i64,
    pub month: i64,
    pub spacing_seconds: i64,
}
fn cap(value: i64, default: i64, hard: i64) -> i64 {
    if value > 0 {
        value.min(hard)
    } else {
        default
    }
}
impl LinkedInLimits {
    pub fn ceiling(&self, class: &str, age: i64) -> Ceiling {
        let mut c = match class {
            "invitation" => Ceiling {
                hour: 10,
                day: cap(self.invite_daily_cap, 20, 25),
                week: cap(self.invite_weekly_cap, 80, 100),
                month: cap(self.invite_noted_monthly_cap, 5, 50),
                spacing_seconds: if self.invite_spacing_seconds > 0 {
                    self.invite_spacing_seconds
                } else {
                    30
                },
            },
            "message" => Ceiling {
                hour: 20,
                day: cap(self.message_daily_cap, 15, 25),
                week: cap(self.message_weekly_cap, 100, 120),
                month: 0,
                spacing_seconds: if self.message_spacing_seconds > 0 {
                    self.message_spacing_seconds
                } else {
                    20
                },
            },
            "profile_view" => Ceiling {
                hour: 30,
                day: cap(self.profile_view_daily_cap, 100, 150),
                ..Default::default()
            },
            "search" => Ceiling {
                day: 100,
                ..Default::default()
            },
            _ => Ceiling::default(),
        };
        let (num, den) = if !self.warmup_enabled || age >= 56 {
            (1, 1)
        } else if age >= 28 {
            (3, 4)
        } else if age >= 14 {
            (1, 2)
        } else {
            (1, 4)
        };
        c.day = (c.day * num + den - 1) / den;
        c.week = (c.week * num + den - 1) / den;
        c
    }
}
#[derive(Clone, Default)]
pub struct PolicyConfig {
    pub defaults: Entitlements,
    pub send_cost_micros: i64,
    pub linkedin: LinkedInLimits,
    pub public_base_url: String,
    pub webhook_secret: String,
}
/// Callback credentials are generated server-side and never accepted from input.
pub fn apollo_input(
    config: &PolicyConfig,
    action: &str,
    project: &str,
    connection: &str,
    input: Value,
) -> Result<Value> {
    if !matches!(action, "people.match" | "people.bulk_match") {
        return Ok(input);
    }
    let mut input = input
        .as_object()
        .cloned()
        .ok_or_else(|| ActionError::new("INVALID_ACTION_INPUT"))?;
    input.remove("webhook_url");
    if input.get("reveal_phone_number").and_then(Value::as_bool) != Some(true) {
        return Ok(Value::Object(input));
    }
    if config.public_base_url.is_empty() || config.webhook_secret.is_empty() {
        input.remove("reveal_phone_number");
        return Ok(Value::Object(input));
    }
    let mut url = url::Url::parse(&config.public_base_url)
        .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ActionError::new("CONNECTOR_UNAVAILABLE"));
    }
    #[derive(serde::Serialize)]
    struct Claims<'a> {
        p: &'a str,
        c: &'a str,
        k: &'a str,
    }
    let payload = serde_json::to_vec(&Claims {
        p: project,
        c: connection,
        k: "apollo",
    })
    .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?;
    let segment = URL_SAFE_NO_PAD.encode(payload);
    let mut mac = Hmac::<Sha256>::new_from_slice(config.webhook_secret.as_bytes())
        .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?;
    mac.update(segment.as_bytes());
    let token = format!(
        "{segment}.{}",
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    );
    url.path_segments_mut()
        .map_err(|_| ActionError::new("CONNECTOR_UNAVAILABLE"))?
        .pop_if_empty()
        .extend(["v1", "connections", connection, "webhooks", "apollo"]);
    url.query_pairs_mut().append_pair("token", &token);
    input.insert("webhook_url".into(), Value::String(url.into()));
    Ok(Value::Object(input))
}
pub fn channel(action: &str) -> &str {
    match action {
        "emails.send" | "emails.list" => "MAIL",
        "linkedin.profile.get" | "linkedin.invitation.send" | "linkedin.relations.list" => {
            "LINKEDIN"
        }
        "chats.start" | "chats.list" => "MESSAGING",
        _ => "",
    }
}
pub(crate) fn linkedin_class(action: &str) -> &str {
    match action {
        "linkedin.invitation.send" => "invitation",
        "linkedin.profile.get" => "profile_view",
        "linkedin.relations.list" => "search",
        _ => "",
    }
}
#[derive(Default)]
pub struct PolicyReservation {
    pub usage: UsageSnapshot,
    pub(crate) quota_id: String,
    pub(crate) quota_month: String,
    pub(crate) provider_account_id: String,
    pub(crate) channel: String,
    pub(crate) class: String,
    pub(crate) windows: Vec<(String, String)>,
}
