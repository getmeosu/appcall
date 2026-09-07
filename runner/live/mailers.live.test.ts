// Live integration tests — these make REAL network calls to real providers.
//
// They are gated on credentials supplied via a gitignored .env (Bun auto-loads
// it). Each block is SKIPPED, not failed, when its credential is absent, so the
// normal `bun test` / CI stays green without secrets. Run them explicitly with
// `make test-live` after putting real keys in .env (see .env.example).
//
// Unlike the connector unit tests (which mock the network), these prove the
// credential is real and the provider is reachable end to end.
import { describe, expect, test } from "bun:test";
import { sendSmtpEmail } from "../connectors/_shared/smtp";

const BREVO_API_KEY = process.env.BREVO_API_KEY ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = process.env.SMTP_PORT ?? "";
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? "";
const SMTP_TEST_TO = process.env.SMTP_TEST_TO ?? "";

describe("live: Brevo REST", () => {
  test.skipIf(!BREVO_API_KEY)("authenticated GET /v3/account succeeds", async () => {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": BREVO_API_KEY, accept: "application/json" },
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(typeof body.email).toBe("string");
  });
});

describe("live: Resend REST", () => {
  test.skipIf(!RESEND_API_KEY)("authenticated GET /domains succeeds", async () => {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${RESEND_API_KEY}` },
    });
    expect(res.ok).toBe(true);
  });
});

describe("live: SendGrid REST", () => {
  test.skipIf(!SENDGRID_API_KEY)("authenticated GET /v3/user/account succeeds", async () => {
    const res = await fetch("https://api.sendgrid.com/v3/user/account", {
      headers: { authorization: `Bearer ${SENDGRID_API_KEY}` },
    });
    expect(res.ok).toBe(true);
  });
});

describe("live: SMTP relay (raw socket transport)", () => {
  // Actually sends a message, so it is gated on SMTP_TEST_TO as an explicit
  // opt-in on top of the SMTP credentials.
  const ready = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASSWORD && SMTP_FROM && SMTP_TEST_TO);
  test.skipIf(!ready)("sends a real email through the SMTP relay", async () => {
    const result = await sendSmtpEmail({
      smtpHost: SMTP_HOST,
      smtpPort: SMTP_PORT,
      smtpUser: SMTP_USER,
      smtpPassword: SMTP_PASSWORD,
      from: SMTP_FROM,
      to: SMTP_TEST_TO,
      subject: "appcall live SMTP test",
      text: "This is a live SMTP integration test from appcall.",
    });
    expect(result.accepted.length).toBeGreaterThan(0);
  });
});
