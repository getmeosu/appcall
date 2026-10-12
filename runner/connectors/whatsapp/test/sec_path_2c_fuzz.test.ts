import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { healthcheck } from "../src/healthcheck";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import {
  BLANK,
  DOT_ONLY,
  PERCENT_DOTS,
  SEPARATORS,
  expectSetupFieldGuarded,
  tryBaseline,
} from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c fuzz over EVERY whatsapp action, including the phoneNumberId setup
// field and the healthcheck path. The 2c-1 fuzz treated phoneNumberId as a fixed
// credential and never varied it, so '..', '%2e%2e', ' .. ' (POST
// graph.facebook.com/messages) and 'a\b' (/v25.0/a/b/messages) slipped through
// the ~20 raw interpolations. Here every string input that reaches the request
// path, credentials included, is replayed with dot-only, blank, percent-dot and
// separator forms.
const CREDS = { accessToken: "t", phoneNumberId: "1234567", graphVersion: "v25.0" };
const BAD = [...DOT_ONLY, ...BLANK, ...PERCENT_DOTS, ...SEPARATORS];
type Spec = { kind?: string; request?: unknown };
const operations = Object.entries(manifest.operations as Record<string, Spec>).filter(([, spec]) => (spec.kind ?? "action") === "action");
// Hand-written ops build the URL themselves through phoneNumberIdSegment (strict:
// every bad form is rejected before fetch). Declarative ops render the path via
// the shared renderer, which rejects dot-only/blank and encodes the rest.
const handWritten = new Set(operations.filter(([, spec]) => spec.request === undefined).map(([key]) => key));
const phoneOps: string[] = [];

describe("whatsapp SEC-PATH-2c fuzz: every action, setup fields included", () => {
  for (const [action] of operations) {
    if (action === "credentials.validate") continue; // local only; covered below
    test(`${action}: every path-bound input is guarded`, async () => {
      const base = await tryBaseline("whatsapp", action, CREDS);
      expect(base, `${action}: baseline made no request`).not.toBeNull();
      const paths = base!.calls.map((call) => new URL(call.url).pathname).join(" ");
      const fields = Object.entries(base!.input)
        .filter(([key, value]) => key !== "accessToken" && key !== "graphVersion" && typeof value === "string" && value.length > 0 && paths.includes(value))
        .map(([key]) => key);
      if (fields.includes("phoneNumberId")) phoneOps.push(action);
      for (const field of fields) {
        await expectSetupFieldGuarded("whatsapp", action, field, base!.input, base!.calls, {
          strict: field === "phoneNumberId" && handWritten.has(action),
          declarative: !handWritten.has(action),
        });
      }
    });
  }

  test("phoneNumberId reaches the path of every expected op (coverage)", () => {
    const hand = phoneOps.filter((op) => handWritten.has(op)).sort();
    expect(hand).toEqual([
      "businessProfile.get", "businessProfile.update", "healthcheck", "media.upload", "messages.markRead",
      "messages.send", "messages.sendAudio", "messages.sendContacts", "messages.sendDocument", "messages.sendImage",
      "messages.sendInteractive", "messages.sendLocation", "messages.sendMedia", "messages.sendMediaById",
      "messages.sendReaction", "messages.sendTemplate", "messages.sendVideo", "phoneNumbers.get",
    ]);
    expect(phoneOps.length).toBeGreaterThan(hand.length);
  });

  test("credentials.validate rejects every bad phoneNumberId", () => {
    for (const bad of BAD) {
      let ok: boolean;
      try {
        ok = defaultConnectorRegistry.executeAction("whatsapp", "credentials.validate", { ...CREDS, phoneNumberId: bad }).ok;
      } catch {
        ok = false;
      }
      expect(ok, JSON.stringify(bad)).toBe(false);
    }
    expect(defaultConnectorRegistry.executeAction("whatsapp", "credentials.validate", CREDS)).toMatchObject({ ok: true });
  });

  test("healthcheck setup field: every bad phoneNumberId is rejected with zero requests", async () => {
    for (const bad of BAD) {
      let calls = 0;
      const fetch = (async () => {
        calls++;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof globalThis.fetch;
      await expect(Promise.resolve().then(() => healthcheck({ ...CREDS, phoneNumberId: bad, fetch })), JSON.stringify(bad)).rejects.toMatchObject({
        ok: false,
        code: "INVALID_ACTION_INPUT",
      });
      expect(calls, JSON.stringify(bad)).toBe(0);
    }
  });

  test("named escapes from the recount are closed", async () => {
    for (const bad of ["..", "%2e%2e", " .. ", "a\\b"]) {
      let calls = 0;
      const fetch = (async () => {
        calls++;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof globalThis.fetch;
      let rejected = false;
      try {
        const result = defaultConnectorRegistry.executeAction("whatsapp", "messages.send", { ...CREDS, phoneNumberId: bad, to: "15550001111", text: "hi", fetch });
        if (!result.ok) rejected = true;
        else await Promise.resolve(result.output).catch(() => { rejected = true; });
      } catch {
        rejected = true;
      }
      expect(rejected, JSON.stringify(bad)).toBe(true);
      expect(calls, JSON.stringify(bad)).toBe(0);
    }
  });
});
