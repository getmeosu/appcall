import { createHmac, timingSafeEqual } from "node:crypto";
import manifest from "../manifest.json";
import { GITHUB_TRIGGERS, matchesTrigger } from "./trigger_map";

// ---------------------------------------------------------------------------
// GitHub webhook ingestion (OXIDE-WH-1)
//
// verifyWebhookRaw proves origin with GitHub's X-Hub-Signature-256: an
// HMAC-SHA256 of the exact request body bytes under the connection's webhook
// secret, hex encoded as `sha256=<64 hex>`. It fails closed: a missing secret,
// a missing or malformed header, or a body that is not byte-identical to what
// GitHub signed (for example re-serialized JSON) never verifies. The secret and
// the signature are never logged, thrown, or echoed.
//
// parseWebhook maps X-GitHub-Event to the declared `webhook.<event>` operation,
// keys idempotency on X-GitHub-Delivery and derives `triggers`: the canonical
// Composio slugs from the locked GitHub trigger map (trigger_map.ts, TRIG-2,
// the same names the TRIG-3a poll syncs emit) whose event/action/field match
// the delivery. Context-bound slugs (ISSUE_ASSIGNED_TO_ME needs the viewer's
// login) are not derived here; a ping or an unmapped event has no triggers.
// ---------------------------------------------------------------------------

export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: Record<string, unknown>;
  triggers: string[];
};

export type RawWebhookVerification = {
  rawBody?: Uint8Array;
  headers: Record<string, string>;
  secret?: string;
};

const SIGNATURE_HEADER = "x-hub-signature-256";
const EVENT_HEADER = "x-github-event";
const DELIVERY_HEADER = "x-github-delivery";
const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/;
const EVENT_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const ACTION_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const DELIVERY_PATTERN = /^[A-Za-z0-9-]{1,128}$/;
const MAX_RETAINED_PAYLOAD_BYTES = 256 * 1024;

// GitHub sends `ping` when a hook is created; it is accepted so hook setup
// succeeds, but it is not a declared trigger operation.
const DECLARED_EVENTS = new Set(
  Object.keys((manifest as { operations: Record<string, unknown> }).operations)
    .filter((key) => key.startsWith("webhook."))
    .map((key) => key.slice("webhook.".length)),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function header(headers: Record<string, string> | undefined, name: string): string {
  if (!isRecord(headers)) return "";
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name && typeof value === "string") return value;
  }
  return "";
}

export function verifyWebhookRaw(input: RawWebhookVerification): boolean {
  const { rawBody, headers, secret } = input;
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (!(rawBody instanceof Uint8Array)) return false;
  const match = SIGNATURE_PATTERN.exec(header(headers, SIGNATURE_HEADER));
  if (!match) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(match[1], "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function retainedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const encoded = JSON.stringify(payload);
  if (Buffer.byteLength(encoded, "utf8") <= MAX_RETAINED_PAYLOAD_BYTES) {
    return { payload };
  }
  return { payloadTruncated: true };
}

function summary(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const repository = payload.repository;
  if (isRecord(repository)) {
    out.repository = { id: repository.id, fullName: repository.full_name };
  }
  const organization = payload.organization;
  if (isRecord(organization)) {
    out.organization = { id: organization.id, login: organization.login };
  }
  const sender = payload.sender;
  if (isRecord(sender)) {
    out.sender = { id: sender.id, login: sender.login };
  }
  const installation = payload.installation;
  if (isRecord(installation) && typeof installation.id === "number") {
    out.installationId = installation.id;
  }
  return out;
}

export function parseWebhook(payload: unknown, headers: Record<string, string> = {}): ParsedWebhook {
  const event = header(headers, EVENT_HEADER);
  if (!EVENT_PATTERN.test(event)) {
    throw new Error("GitHub webhook is missing a valid X-GitHub-Event header.");
  }
  if (event !== "ping" && !DECLARED_EVENTS.has(event)) {
    throw new Error("GitHub webhook event is not declared by the connector.");
  }
  const delivery = header(headers, DELIVERY_HEADER);
  if (!DELIVERY_PATTERN.test(delivery)) {
    throw new Error("GitHub webhook is missing a valid X-GitHub-Delivery header.");
  }
  if (!isRecord(payload)) {
    throw new Error("GitHub webhook payload must be a JSON object.");
  }
  const action = typeof payload.action === "string" && ACTION_PATTERN.test(payload.action)
    ? payload.action
    : "";
  const triggers = Object.keys(GITHUB_TRIGGERS).filter((slug) => matchesTrigger(slug, event, payload)).sort();
  return {
    idempotencyKey: `github-wh:${delivery}`,
    operation: event === "ping" ? "" : `webhook.${event}`,
    sanitized: {
      event,
      ...(action ? { action } : {}),
      deliveryId: delivery,
      ...summary(payload),
      ...retainedPayload(payload),
    },
    triggers,
  };
}
