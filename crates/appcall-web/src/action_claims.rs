//! Server-rendered operator surface for inspecting and explicitly resolving
//! one durable action idempotency claim.
//!
//! The page deliberately exposes request metadata only. It never renders the
//! original action input, connector credentials, or an actor selector. The
//! host derives the actor from the authenticated browser principal.

use crate::{http::escape, ui, Error};
use serde_json::Value;

fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn bool_value(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn bounded_text(value: &str, max: usize) -> Result<String, Error> {
    if value.is_empty() || value.len() > max || value.chars().any(char::is_control) {
        return Err(Error::Unavailable);
    }
    Ok(value.to_owned())
}

fn field(
    id: &'static str,
    name: &'static str,
    label: &'static str,
    value: &str,
    placeholder: &'static str,
    required: bool,
    help: &'static str,
) -> String {
    let mut control = ui::Field::new(id, name, label, ui::Control::Input(ui::InputType::Text));
    control.value = value;
    control.placeholder = placeholder;
    control.required = required;
    control.help = help;
    control.autocomplete = Some("off");
    control.render()
}

fn hidden(name: &'static str, value: &str) -> String {
    let mut control = ui::Field::new(name, name, "", ui::Control::Input(ui::InputType::Hidden));
    control.value = value;
    control.render()
}

fn submit(label: &'static str) -> String {
    let mut button = ui::Button::new(label);
    button.target = ui::ButtonTarget::Button {
        kind: ui::ButtonType::Submit,
        form: None,
        action: None,
    };
    button.render()
}

fn header() -> String {
    "<header class=\"action-claims-header\"><h2>Action claim recovery</h2><p>Inspect one durable action claim by its immutable request identity before recording an explicit operator resolution.</p></header>".into()
}

fn lookup_form(account: &str, key: &str, request_id: &str) -> String {
    format!(
        "<form id=\"action-claims-lookup\" class=\"action-claims-card action-claims-form\" method=\"get\" action=\"/app/action-claims\" aria-label=\"Inspect action claim\">{}{}{}<div class=\"action-claims-form-actions\">{}</div></form>",
        field(
            "action-claims-account",
            "externalAccountId",
            "External account",
            account,
            "Account identifier",
            true,
            "The account is checked against your authenticated project scope.",
        ),
        field(
            "action-claims-key",
            "idempotencyKey",
            "Idempotency key",
            key,
            "Original action key",
            true,
            "Use the key recorded by the action request.",
        ),
        field(
            "action-claims-request",
            "expectedRequestId",
            "Expected request ID",
            request_id,
            "req_…",
            true,
            "The exact request ID is required; stale or different requests are rejected.",
        ),
        submit("Inspect claim")
    )
}

fn resolution_fields(claim: &Value) -> Result<String, Error> {
    let account = bounded_text(text(claim, "externalAccountId"), 128)?;
    let key = bounded_text(text(claim, "idempotencyKey"), 128)?;
    let request_id = bounded_text(text(claim, "requestId"), 128)?;
    let evidence = field(
        "action-claims-evidence",
        "evidenceRef",
        "Evidence reference",
        "",
        "ticket://incident/123",
        true,
        "A bounded ticket, incident, or investigation reference (256 characters max).",
    );
    let resolutions = [
        ui::SelectOption {
            value: "",
            label: "Select a resolution",
            disabled: false,
        },
        ui::SelectOption {
            value: "provenNotDispatched",
            label: "Proven not dispatched (release key and charges)",
            disabled: false,
        },
        ui::SelectOption {
            value: "providerOutcomeKnown",
            label: "Provider outcome known (keep mutation fence)",
            disabled: false,
        },
    ];
    let mut resolution = ui::Field::new(
        "action-claims-resolution",
        "resolution",
        "Resolution",
        ui::Control::Select(&resolutions),
    );
    resolution.required = true;
    resolution.help =
        "Choose only evidence-backed state; this page never retries a provider action.";
    let outcomes = [
        ui::SelectOption {
            value: "",
            label: "Not applicable",
            disabled: false,
        },
        ui::SelectOption {
            value: "true",
            label: "Provider succeeded",
            disabled: false,
        },
        ui::SelectOption {
            value: "false",
            label: "Provider failed",
            disabled: false,
        },
    ];
    let mut outcome = ui::Field::new(
        "action-claims-provider-succeeded",
        "providerSucceeded",
        "Provider outcome",
        ui::Control::Select(&outcomes),
    );
    outcome.help = "Required only for Provider outcome known.";
    let resolution_fields = format!("{}{}", resolution.render(), outcome.render());
    Ok(format!(
        "<form id=\"action-claims-reconcile\" class=\"action-claims-card action-claims-form\" method=\"post\" action=\"/app/action-claims/reconcile\" aria-label=\"Reconcile action claim\">{}{}{}{}{}<p class=\"action-claims-warning\">No provider call or automatic retry is performed. Only Proven not dispatched can release the idempotency key; a known provider outcome keeps the mutation fence.</p><div class=\"action-claims-form-actions\">{}</div></form>",
        hidden("externalAccountId", &account),
        hidden("idempotencyKey", &key),
        hidden("expectedRequestId", &request_id),
        evidence,
        resolution_fields,
        submit("Record resolution")
    ))
}

fn claim_summary(claim: &Value) -> Result<String, Error> {
    let key = bounded_text(text(claim, "idempotencyKey"), 128)?;
    let request_id = bounded_text(text(claim, "requestId"), 128)?;
    let account = bounded_text(text(claim, "externalAccountId"), 128)?;
    let connection = bounded_text(text(claim, "connectionId"), 256)?;
    let connector = bounded_text(text(claim, "connector"), 256)?;
    let action = bounded_text(text(claim, "action"), 256)?;
    let dispatched = if bool_value(claim, "dispatched") {
        "Dispatched"
    } else {
        "Not dispatched"
    };
    let lease = if bool_value(claim, "leaseExpired") {
        "Expired / quiescent"
    } else {
        "Live"
    };
    let allowed = bool_value(claim, "reconciliationAllowed");
    let mut html = format!(
        "<section class=\"action-claims-card\" aria-labelledby=\"action-claims-detail-heading\"><h3 id=\"action-claims-detail-heading\">Claim {}</h3><dl class=\"action-claims-details\"><div><dt>Request ID</dt><dd><code>{}</code></dd></div><div><dt>Account</dt><dd><code>{}</code></dd></div><div><dt>Connection</dt><dd><code>{}</code></dd></div><div><dt>Connector</dt><dd><code>{}</code></dd></div><div><dt>Action</dt><dd><code>{}</code></dd></div><div><dt>Dispatch evidence</dt><dd>{}</dd></div><div><dt>Lease state</dt><dd>{}</dd></div></dl>",
        escape(&key),
        escape(&request_id),
        escape(&account),
        escape(&connection),
        escape(&connector),
        escape(&action),
        dispatched,
        lease,
    );
    if allowed {
        html.push_str("<h3>Reconcile this claim</h3>");
        html.push_str(&resolution_fields(claim)?);
    } else {
        html.push_str("<p role=\"status\" class=\"action-claims-warning\">This claim is not eligible for reconciliation. It must be dispatched, expired, and owned by this account, with no prior terminal resolution.</p>");
    }
    html.push_str("</section>");
    Ok(html)
}

pub(crate) fn render_lookup(value: &Value) -> Result<String, Error> {
    let claim = value.get("claim").filter(|claim| !claim.is_null());
    let account = text(value, "accountId");
    let account = if account.is_empty() {
        claim
            .map(|claim| text(claim, "externalAccountId"))
            .unwrap_or("")
    } else {
        account
    };
    let key = text(value, "idempotencyKey");
    let key = if key.is_empty() {
        claim
            .map(|claim| text(claim, "idempotencyKey"))
            .unwrap_or("")
    } else {
        key
    };
    let request_id = text(value, "expectedRequestId");
    let request_id = if request_id.is_empty() {
        claim.map(|claim| text(claim, "requestId")).unwrap_or("")
    } else {
        request_id
    };
    let mut html = header();
    html.push_str(&lookup_form(account, key, request_id));
    match claim {
        None => html.push_str("<p id=\"action-claims-empty\" class=\"action-claims-empty\">Enter an account, idempotency key, and expected request ID to inspect a claim.</p>"),
        Some(claim) => html.push_str(&claim_summary(claim)?),
    }
    Ok(format!(
        "<section id=\"action-claims-page\">{html}</section>"
    ))
}

pub(crate) fn render_reconciliation(value: &Value) -> Result<String, Error> {
    let audit_id = bounded_text(text(value, "auditId"), 128)?;
    let reservation = text(value, "reservationState");
    let refunded = bool_value(value, "chargesRefunded");
    let usage = bool_value(value, "usageRecorded");
    let kind = value
        .get("resolution")
        .and_then(|resolution| resolution.get("kind"))
        .and_then(Value::as_str)
        .ok_or(Error::Unavailable)?;
    let resolution = match kind {
        "provenNotDispatched" => "Proven not dispatched",
        "providerOutcomeKnown" => "Provider outcome known",
        _ => return Err(Error::Unavailable),
    };
    let back = ui::Button {
        target: ui::ButtonTarget::Link(ui::LocalPath::new("/app/action-claims").unwrap()),
        variant: ui::ButtonVariant::Secondary,
        size: ui::ButtonSize::Sm,
        ..ui::Button::new("Inspect another claim")
    }
    .render();
    Ok(format!(
        "<section id=\"action-claims-page\"><header class=\"action-claims-header\"><h2>Reconciliation recorded</h2><p>No provider call or automatic retry was performed.</p></header><section class=\"action-claims-card\"><dl class=\"action-claims-details\"><div><dt>Audit ID</dt><dd><code>{}</code></dd></div><div><dt>Resolution</dt><dd>{}</dd></div><div><dt>Reservation state</dt><dd>{}</dd></div><div><dt>Charges</dt><dd>{}</dd></div><div><dt>Usage event</dt><dd>{}</dd></div></dl>{}</section></section>",
        escape(&audit_id),
        resolution,
        escape(if reservation.is_empty() { "None" } else { reservation }),
        if refunded { "Charges refunded" } else { "No charges refunded" },
        if usage { "Usage recorded" } else { "Usage not recorded" },
        back,
    ))
}
