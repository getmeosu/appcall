use super::*;
/// Fixed method/path responses: incoming fields are never reflected or retained.
pub fn broker_fixture(scenario: Scenario, method: &str, path: &str) -> (u16, Value) {
    if method == "POST" {
        return auth_fixture(scenario, path);
    }
    if method != "GET" {
        return rejection(404);
    }
    let value = match path {
        "/api/auth/providers" => {
            json!({"google":false,"github":false,"microsoft":false,"magicLink":true,"otp":true})
        }
        "/api/auth/me" => {
            json!({"user":{"email":"preview@example.invalid","displayName":"Synthetic Preview User","totpEnabled":false}})
        }
        "/api/billing/status" => match scenario {
            Scenario::Unavailable | Scenario::BillingStatusUnavailable => return rejection(503),
            Scenario::BillingPartial => {
                json!({"billingStatus":"active","plan":{"name":"Synthetic Pro"}})
            }
            Scenario::BillingMissing => json!({}),
            _ => {
                json!({"billingStatus":"active","plan":{"name":"Pro"},"subscriptionCredits":900,"purchasedCredits":120,"currentPeriodEnd":"2026-10-01T00:00:00Z"})
            }
        },
        "/api/plans" => match scenario {
            Scenario::Unavailable | Scenario::BillingPlansUnavailable => return rejection(503),
            Scenario::BillingEmptyPlans => json!({"plans":[]}),
            _ => {
                json!({"plans":[{"id":"starter","name":"Starter","description":"For your first integrations","price":2900,"currency":"USD","billingInterval":"month"},{"id":"pro","name":"Pro","description":"For growing integration traffic","price":29900,"currency":"USD","billingInterval":"annual"}]})
            }
        },
        "/api/tenant/members" => {
            json!({"members":[{"userId":"owner","displayName":"Preview Owner","email":"owner@example.invalid","role":"owner"},{"userId":"member","displayName":"Preview Member","email":"member@example.invalid","role":"user"}]})
        }
        "/api/auth/sessions" => {
            json!({"sessions":[{"id":"current","userAgent":"Preview Browser","ipAddress":"127.0.0.1","current":true,"createdAt":"2026-09-07T10:00:00Z","expiresAt":"2026-10-07T10:00:00Z"}]})
        }
        _ => return rejection(404),
    };
    (200, value)
}
fn auth_fixture(scenario: Scenario, path: &str) -> (u16, Value) {
    if path == "/api/auth/mfa/setup" {
        return (
            200,
            json!({"url":"otpauth://totp/Appcall:preview?secret=JBSWY3DPEHPK3PXP&issuer=Appcall","secret":"JBSWY3DPEHPK3PXP"}),
        );
    }
    if !matches!(
        path,
        "/api/auth/login"
            | "/api/auth/mfa/challenge"
            | "/api/auth/register"
            | "/api/auth/otp/verify"
            | "/api/auth/otp/request"
            | "/api/auth/forgot-password"
            | "/api/auth/magic-link"
    ) {
        return rejection(404);
    }
    if scenario == Scenario::AuthUnavailable {
        return rejection(503);
    }
    if scenario == Scenario::AuthAccepted {
        if path == "/api/auth/login" {
            return (
                200,
                json!({"mfaRequired":true,"mfaToken":"synthetic_mfa_challenge"}),
            );
        }
        if matches!(
            path,
            "/api/auth/otp/request" | "/api/auth/forgot-password" | "/api/auth/magic-link"
        ) {
            return (200, json!({"synthetic":true,"received":true}));
        }
    }
    rejection(
        if matches!(
            path,
            "/api/auth/login" | "/api/auth/mfa/challenge" | "/api/auth/otp/verify"
        ) {
            401
        } else {
            400
        },
    )
}
fn rejection(status: u16) -> (u16, Value) {
    (
        status,
        json!({"error":"Synthetic preview response; no identity request was sent."}),
    )
}
