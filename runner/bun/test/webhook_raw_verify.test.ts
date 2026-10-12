import { createHmac } from "node:crypto";
import { describe, expect, spyOn, test } from "bun:test";
import { handleRPC } from "../src/server";
import { createConnectorRegistry, defaultConnectorRegistry } from "../src/registry";
import { parseWebhook, verifyWebhookRaw } from "../../connectors/github/src/webhook";
import { GITHUB_TRIGGERS } from "../../connectors/github/src/trigger_map";
import githubManifest from "../../connectors/github/manifest.json";

const SECRET = "fixture-github-hook-secret";
// Deliberately not JSON.stringify output so a re-serialized body differs.
const BODY = '{"action": "opened", "issue": {"number": 7}, "repository": {"id": 1, "full_name": "o/r"}}';

function sign(body: string | Uint8Array, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}
function b64(body: string): string {
  return Buffer.from(body, "utf8").toString("base64");
}
function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-github-event": "issues",
    "x-github-delivery": "72d3162e-cc78-11e3-81ab-4c9367dc0958",
    "x-hub-signature-256": sign(BODY),
    ...extra,
  };
}
async function rpc(method: string, params: Record<string, unknown>) {
  const response = await handleRPC(
    new Request("http://runner.local/rpc", {
      method: "POST",
      body: JSON.stringify({ id: "req_gh", method, params }),
    }),
  );
  return { status: response.status, body: await response.json() };
}
function verify(params: Record<string, unknown>) {
  return rpc("connector.webhook.verify", {
    connectorKey: "github",
    payload: JSON.parse(BODY),
    headers: headers(),
    rawBody: b64(BODY),
    secret: SECRET,
    ...params,
  });
}

describe("GitHub X-Hub-Signature-256 raw-body verification", () => {
  test("a valid signature over the exact bytes verifies", async () => {
    const result = await verify({});
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ id: "req_gh", ok: true, result: { verified: true } });
  });

  const rejected: Array<[string, Record<string, unknown>]> = [
    ["tampered body", { rawBody: b64(BODY.replace("opened", "closed")) }],
    ["wrong secret", { secret: "not-the-secret" }],
    ["missing secret", { secret: undefined }],
    ["empty secret", { secret: "" }],
    ["missing raw body", { rawBody: undefined }],
    ["missing signature header", { headers: { "x-github-event": "issues" } }],
    ["sha1 prefix", { headers: headers({ "x-hub-signature-256": sign(BODY).replace("sha256=", "sha1=") }) }],
    ["uppercase hex", { headers: headers({ "x-hub-signature-256": `sha256=${sign(BODY).slice(7).toUpperCase()}` }) }],
    ["truncated hex", { headers: headers({ "x-hub-signature-256": sign(BODY).slice(0, -2) }) }],
    ["trailing whitespace", { headers: headers({ "x-hub-signature-256": `${sign(BODY)} ` }) }],
    ["re-serialized JSON", { rawBody: b64(JSON.stringify(JSON.parse(BODY))) }],
  ];
  for (const [name, params] of rejected) {
    test(`fails closed: ${name}`, async () => {
      const result = await verify(params);
      expect(result.status).toBe(400);
      expect(result.body.ok).toBe(false);
      expect(result.body.error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    });
  }

  test("a malformed base64 raw body is rejected before verification", async () => {
    const result = await verify({ rawBody: "not base64!" });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("INVALID_WEBHOOK_PAYLOAD");
  });

  test("the secret and signature never reach logs or the response", async () => {
    const spies = [spyOn(console, "log"), spyOn(console, "info"), spyOn(console, "warn"), spyOn(console, "error")];
    try {
      const bad = await verify({ headers: headers({ "x-hub-signature-256": sign(BODY, "other") }) });
      const good = await verify({});
      const text = JSON.stringify([bad.body, good.body]) +
        JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(sign(BODY).slice(7));
      expect(text).not.toContain(sign(BODY, "other").slice(7));
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  test("verifyWebhookRaw compares the full digest (unit)", () => {
    const raw = new TextEncoder().encode(BODY);
    expect(verifyWebhookRaw({ rawBody: raw, headers: headers(), secret: SECRET })).toBe(true);
    expect(verifyWebhookRaw({ rawBody: raw, headers: headers(), secret: undefined })).toBe(false);
    const flipped = sign(BODY).slice(0, -1) + (sign(BODY).endsWith("0") ? "1" : "0");
    expect(verifyWebhookRaw({ rawBody: raw, headers: headers({ "x-hub-signature-256": flipped }), secret: SECRET })).toBe(false);
  });
});

describe("webhook parse receives request headers", () => {
  test("X-GitHub-Event and X-GitHub-Delivery reach the GitHub parser over RPC", async () => {
    const result = await rpc("connector.webhook.parse", {
      connectorKey: "github",
      payload: JSON.parse(BODY),
      headers: { "X-GitHub-Event": "issues", "X-GitHub-Delivery": "delivery-1" },
    });
    expect(result.status).toBe(200);
    expect(result.body.result.idempotencyKey).toBe("github-wh:delivery-1");
    expect(result.body.result.operation).toBe("webhook.issues");
    expect(result.body.result.triggers).toEqual(["GITHUB_ISSUE_ADDED_EVENT", "GITHUB_ISSUE_CREATED_TRIGGER", "GITHUB_ISSUE_EVENT_OCCURRED_TRIGGER"]);
    expect(result.body.result.sanitized.event).toBe("issues");
    expect(result.body.result.sanitized.repository).toEqual({ id: 1, fullName: "o/r" });
  });

  test("events without an action match whole-event slugs; ping is accepted with no operation and no triggers", () => {
    expect(parseWebhook({ ref: "refs/heads/main" }, { "x-github-event": "push", "x-github-delivery": "d" }).triggers)
      .toEqual(["GITHUB_BRANCH_CHANGED_TRIGGER", "GITHUB_COMMIT_EVENT"]);
    const ping = parseWebhook({ zen: "z" }, { "x-github-event": "ping", "x-github-delivery": "d" });
    expect(ping.operation).toBe("");
    expect(ping.triggers).toEqual([]);
  });

  test("missing or undeclared events and missing deliveries fail parse", async () => {
    for (const hdrs of [
      { "x-github-delivery": "d" },
      { "x-github-event": "not_declared_event", "x-github-delivery": "d" },
      { "x-github-event": "issues" },
    ]) {
      const result = await rpc("connector.webhook.parse", { connectorKey: "github", payload: {}, headers: hdrs });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("WEBHOOK_PARSE_FAILED");
    }
  });

  test("a generic parser receives headers and existing connectors ignore them", () => {
    const seen: Array<Record<string, string>> = [];
    const registry = createConnectorRegistry({
      manifests: [],
      actions: {},
      syncs: {},
      healthchecks: {},
      webhooks: {
        probe: {
          parse: (_payload: unknown, hdrs: Record<string, string>) => {
            seen.push(hdrs);
            return { idempotencyKey: "k", sanitized: {} };
          },
        },
      },
    } as never);
    expect(registry.parseWebhook("probe", {}, { "x-probe": "1" }).ok).toBe(true);
    expect(seen).toEqual([{ "x-probe": "1" }]);
    // Existing payload-only parsers and verifiers keep their behaviour when
    // no headers, raw body or secret are supplied.
    const rb2b = defaultConnectorRegistry.parseWebhook("rb2b", { event_id: "e1" });
    expect(rb2b.ok).toBe(true);
    expect(defaultConnectorRegistry.verifyWebhook("apollo", {}, {})).toEqual({ ok: true, output: { verified: true } });
    expect(defaultConnectorRegistry.verifyWebhook("rb2b", {}, {})).toEqual({ ok: true, output: { verified: true } });
  });
});

// Trigger names are the canonical Composio slugs of the locked GitHub trigger
// map (TRIG-2 trigger_map.ts; github-trigger-actions.md, locked by linus), the
// same names the TRIG-3a poll syncs emit.
describe("webhook triggers use the locked Composio trigger map", () => {
  const declared = new Set(
    Object.keys(githubManifest.operations).filter((op) => op.startsWith("webhook.")).map((op) => op.slice(8)),
  );
  const slugs = Object.keys(GITHUB_TRIGGERS);
  const whereFields: Record<string, Record<string, unknown>> = {
    refType: {},
    refPrefix: { ref: "feature/x" },
    tagPushCreated: { created: true, ref: "refs/tags/v1" },
  };
  function delivery(event: string, action: string | undefined, where?: { kind: string; value?: string }) {
    const payload: Record<string, unknown> = { ...(action ? { action } : {}) };
    if (where?.kind === "refType") Object.assign(payload, { ref_type: where.value, ref: where.value === "tag" ? "v1" : "main" });
    else if (where) Object.assign(payload, whereFields[where.kind]);
    return parseWebhook(payload, { "x-github-event": event, "x-github-delivery": "72d3162e-cc78-11e3-81ab-4c9367dc0958" });
  }

  test("the map is the locked 46 slugs, including the 4 TRIG-3a poll names", () => {
    expect(slugs).toHaveLength(46);
    for (const slug of slugs) expect(slug).toMatch(/^GITHUB_[A-Z_]+$/);
    for (const polled of [
      "GITHUB_ARTIFACT_CREATED_TRIGGER",
      "GITHUB_WORKFLOW_ADDED_TRIGGER",
      "GITHUB_DEPLOYMENT_STATE_CHANGED_TRIGGER",
      "GITHUB_FOLLOWER_EVENT",
    ]) {
      expect(GITHUB_TRIGGERS[polled]?.class).toBe("not-named");
    }
  });

  test("every declared event/action in the map derives its slug, and only map slugs are emitted", () => {
    let checked = 0;
    for (const [slug, entry] of Object.entries(GITHUB_TRIGGERS)) {
      for (const match of entry.match) {
        if (!declared.has(match.event) || match.where?.kind === "assigneeIsViewer") continue;
        for (const action of match.actions ?? [undefined]) {
          const triggers = delivery(match.event, action, match.where).triggers;
          expect(triggers, `${slug} ${match.event}.${action}`).toContain(slug);
          for (const emitted of triggers) expect(slugs).toContain(emitted);
          expect(new Set(triggers).size).toBe(triggers.length);
          expect(triggers.length).toBeLessThanOrEqual(16);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(60);
  });

  test("poll-only and context-bound slugs are never derived from a webhook", () => {
    const neverDerived = new Set([
      ...slugs.filter((slug) => GITHUB_TRIGGERS[slug]!.class === "not-named"),
      "GITHUB_ISSUE_ASSIGNED_TO_ME_TRIGGER",
    ]);
    for (const event of declared) {
      for (const action of [undefined, "opened", "assigned", "created", "completed", "closed"]) {
        for (const emitted of delivery(event, action).triggers) expect(neverDerived.has(emitted)).toBe(false);
      }
    }
  });

  test("an action outside a slug's narrowed list does not fire it", () => {
    expect(delivery("pull_request", "opened").triggers).toEqual(["GITHUB_PULL_REQUEST_CREATED", "GITHUB_PULL_REQUEST_EVENT"]);
    expect(delivery("pull_request", "locked").triggers).toEqual(["GITHUB_PULL_REQUEST_STATE_CHANGED_TRIGGER"]);
    expect(delivery("issues", "deleted").triggers).toEqual(["GITHUB_ISSUE_EVENT_OCCURRED_TRIGGER"]);
    expect(delivery("create", undefined, { kind: "refType", value: "tag" }).triggers)
      .toEqual(["GITHUB_GIT_REFERENCE_CREATED_TRIGGER", "GITHUB_REPOSITORY_TAG_CREATED_TRIGGER"]);
  });
});

// The connection's webhook secret is an opaque setup secret (SEC-SETUP-1 class:
// never rendered into a host, path or query), stored in the encrypted bundle.
describe("GitHub webhookSecret setup field", () => {
  const field = (githubManifest.auth.setup.fields as Array<Record<string, unknown>>).find((f) => f.key === "webhookSecret");
  test("is declared optional and secret", () => {
    expect(field).toMatchObject({ key: "webhookSecret", required: false, secret: true });
  });
  test("is never templated into a URL, host, header or query", () => {
    const { auth, ...rest } = githubManifest as Record<string, unknown>;
    expect(JSON.stringify(rest)).not.toContain("webhookSecret");
    expect(JSON.stringify(auth)).not.toContain("{{webhookSecret}}");
  });
  test("verify passes with the secret set and fails closed when it is unset", async () => {
    expect((await verify({})).body).toEqual({ id: "req_gh", ok: true, result: { verified: true } });
    const unset = await verify({ secret: undefined });
    expect(unset.status).not.toBe(200);
    expect(JSON.stringify(unset.body)).not.toContain(SECRET);
  });
});
