// LI-SCOPES (v0.7.0): the default connect set (manifest auth.scopes) is read-only;
// every op declares op-level requiredScopes; reads never need reconsent, writes
// always do; and every op with requiredScopes maps a LinkedIn permission failure
// to CONNECTOR_CAPABILITY_MISSING, whichever handler module it lives in.
// Scope sources (all view=li-lms-2026-09): see
// /workspace/parity-briefs/linkedin-ads-scopes-selflock.md.
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultConnectorRegistry as registry } from "../../../bun/src/registry";
import manifest from "../manifest.json";
import { getCampaign } from "../src/actions";
import { updateLeadForm } from "../src/parity-actions";
import { PROGRAM_GATED_SCOPES } from "../src/g1-runtime";

type Op = { kind: string; sideEffect: string; description: string; requiredScopes?: string[] };
type Exchange = { response: { status: number; headers: Record<string, string>; body: unknown } };
type Case = { id: string; operation: string; input: Record<string, unknown>; exchanges: Exchange[] };

const operations = manifest.operations as unknown as Record<string, Op>;
const authScopes = manifest.auth.scopes as string[];
const credential = { accessToken: "fixture-access-value" };

/** The default connect set before LI-SCOPES (v0.6.0), i.e. what existing connections consented to. */
const LEGACY_CONNECT_SET = ["r_ads", "rw_ads", "r_ads_reporting", "r_organization_social", "r_organization_admin", "rw_organization_admin"];
/** Reads whose only scope is program-gated: never in auth.scopes (it would break OAuth for apps without the program). */
const PROGRAM_GATED_READS = ["dmp_segments.list", "events.search"];
/** Reads LinkedIn documents as needing no OAuth permission beyond any 3-legged Marketing API token (TGT, AUD). */
const NO_SCOPE_READS = ["audience_counts.get", "targeting.entities.list", "targeting.facets.list"];

const isWrite = (op: Op) => op.sideEffect === "write" || op.sideEffect === "destructive";
const isWriteScope = (scope: string) => scope.startsWith("rw_") || scope.startsWith("w_");

const casesDir = join(import.meta.dir, "../fixtures/cases");
const cases: Case[] = readdirSync(casesDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(casesDir, name), "utf8")));

const DENIED = { status: 403, serviceErrorCode: 100, code: "ACCESS_DENIED", message: "Not enough permissions to access: partnerApiAdAccounts.GET.20260901" };

function always(status: number, body: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

async function failure(promise: unknown): Promise<any> {
  try { await promise; } catch (error) { return error; }
  throw new Error("expected a failure");
}

async function dispatchFailure(item: Case, status: number, body: unknown): Promise<any> {
  const input = { ...credential, ...item.input, fetch: always(status, body) };
  const kind = operations[item.operation]!.kind;
  const result: any = item.operation === "healthcheck"
    ? registry.healthcheck("linkedin-ads", input)
    : kind === "sync"
      ? registry.executeSync("linkedin-ads", item.operation, input)
      : registry.executeAction("linkedin-ads", item.operation, input);
  expect(result?.ok, `${item.id}: ${JSON.stringify(result)}`).toBe(true);
  return failure(result.output);
}

describe("LI-SCOPES manifest contract", () => {
  it("is v0.7.0 with 47 ops (+0)", () => {
    expect(manifest.version).toBe("0.7.0");
    expect(Object.keys(operations)).toHaveLength(47);
  });

  it("auth.scopes is the read-only default connect set and contains no write scope", () => {
    expect(authScopes).toEqual(["r_ads", "r_ads_reporting", "r_organization_admin", "r_organization_social"]);
    for (const scope of authScopes) expect(isWriteScope(scope), scope).toBe(false);
    for (const scope of authScopes) expect(PROGRAM_GATED_SCOPES[scope], scope).toBeUndefined();
  });

  it("every op declares an op-level requiredScopes array", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(Array.isArray(op.requiredScopes), key).toBe(true);
      expect(new Set(op.requiredScopes).size, key).toBe(op.requiredScopes!.length);
    }
    const empty = Object.entries(operations).filter(([, op]) => op.requiredScopes!.length === 0).map(([key]) => key).sort();
    expect(empty).toEqual(NO_SCOPE_READS);
  });

  it("reads never need reconsent: every read's requiredScopes is a subset of auth.scopes (program-gated reads excepted and pinned)", () => {
    const gated: string[] = [];
    for (const [key, op] of Object.entries(operations)) {
      if (isWrite(op)) continue;
      expect(op.sideEffect, key).toBe("read");
      const outside = op.requiredScopes!.filter((scope) => !authScopes.includes(scope));
      if (outside.length === 0) continue;
      gated.push(key);
      for (const scope of outside) expect(PROGRAM_GATED_SCOPES[scope], `${key} needs ${scope}`).toBeDefined();
    }
    expect(gated.sort()).toEqual(PROGRAM_GATED_READS);
  });

  it("every write needs at least one scope outside auth.scopes, so a write always triggers reconsent", () => {
    const writes = Object.entries(operations).filter(([, op]) => isWrite(op));
    expect(writes.length).toBe(14);
    for (const [key, op] of writes) {
      expect(op.requiredScopes!.length, key).toBeGreaterThan(0);
      expect(op.requiredScopes!.some((scope) => !authScopes.includes(scope)), key).toBe(true);
      expect(op.requiredScopes!.some(isWriteScope), key).toBe(true);
    }
  });

  it("program-gated ops name their program in the description", () => {
    for (const [key, op] of Object.entries(operations)) {
      for (const scope of op.requiredScopes!) {
        const program = PROGRAM_GATED_SCOPES[scope];
        if (!program) continue;
        expect(op.description, key).toContain("Program-gated");
        expect(op.description.includes("Matched Audiences") || op.description.includes("Events Management"), key).toBe(true);
      }
    }
    expect(operations["dmp_segments.list"]!.requiredScopes).toEqual(["rw_dmp_segments"]);
    expect(operations["events.search"]!.requiredScopes).toEqual(["r_events"]);
    expect(operations["lead_forms.list"]!.description).toContain("Lead Sync API program");
  });

  it("existing connections that consented to the old full set keep working for reads and writes", () => {
    for (const [key, op] of Object.entries(operations)) {
      if (PROGRAM_GATED_READS.includes(key)) {
        // Never in any connect set, before or after: unchanged behaviour.
        expect(op.requiredScopes!.some((scope) => LEGACY_CONNECT_SET.includes(scope)), key).toBe(false);
        continue;
      }
      for (const scope of op.requiredScopes!) expect(LEGACY_CONNECT_SET, `${key} needs ${scope}`).toContain(scope);
    }
    // The new default is a strict subset of the legacy set: nothing new is asked of an old connection.
    for (const scope of authScopes) expect(LEGACY_CONNECT_SET).toContain(scope);
  });
});

describe("LI-SCOPES permission mapping across every handler module", () => {
  it("has a fixture case for every op", () => {
    expect(cases.map((item) => item.operation).sort()).toEqual(Object.keys(operations).sort());
  });

  for (const item of cases) {
    const op = operations[item.operation]!;
    const scopes = op.requiredScopes!;
    if (scopes.length > 0) {
      it(`${item.operation}: 403 ACCESS_DENIED -> CONNECTOR_CAPABILITY_MISSING with its requiredScopes`, async () => {
        const error = await dispatchFailure(item, 403, DENIED);
        expect(error, item.id).toMatchObject({
          code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing", missingScopes: scopes, requiredScopes: scopes, reconsentRequired: true,
        });
      });
    } else {
      it(`${item.operation}: no requiredScopes, so a 403 stays CONNECTOR_UPSTREAM_ERROR`, async () => {
        const error = await dispatchFailure(item, 403, DENIED);
        expect(error.code, item.id).toBe("CONNECTOR_UPSTREAM_ERROR");
      });
    }
    it(`${item.operation}: a plain 400 validation error stays CONNECTOR_UPSTREAM_ERROR`, async () => {
      const error = await dispatchFailure(item, 400, { status: 400, message: "Invalid value for field", errorDetails: { inputErrors: [{ code: "INVALID_VALUE" }] } });
      expect(error.code, item.id).toBe("CONNECTOR_UPSTREAM_ERROR");
      expect(error.reason, item.id).toBeUndefined();
    });
  }

  it("pre-G1 read op (campaigns.get, actions.ts): 403 maps to r_ads, plain 400 and 422 stay upstream", async () => {
    const denied = await failure(getCampaign({ ...credential, accountId: "1", campaignId: "2", fetch: always(403, DENIED) } as never));
    expect(denied).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing", missingScopes: ["r_ads"], requiredScopes: ["r_ads"], reconsentRequired: true });
    expect(denied.program).toBeUndefined();
    for (const status of [400, 422]) {
      const plain = await failure(getCampaign({ ...credential, accountId: "1", campaignId: "2", fetch: always(status, { status, message: "Invalid field value" }) } as never));
      expect(plain.code, String(status)).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });

  it("pre-G1 write op (lead_forms.update, parity-actions.ts): 403 maps to rw_ads, plain 400 and 422 stay upstream", async () => {
    const input = { ...credential, form_id: "656", patch: { $set: { state: "ARCHIVED" } } };
    const denied = await failure(updateLeadForm({ ...input, fetch: always(403, DENIED) }));
    expect(denied).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing", missingScopes: ["rw_ads"], requiredScopes: ["rw_ads"], reconsentRequired: true });
    for (const status of [400, 422]) {
      const plain = await failure(updateLeadForm({ ...input, fetch: always(status, { status, message: "Form is not in an editable state" }) }));
      expect(plain.code, String(status)).toBe("CONNECTOR_UPSTREAM_ERROR");
      expect(plain.reason).toBeUndefined();
    }
  });

  it("a program-gated op names its program on the permission error", async () => {
    const item = cases.find((entry) => entry.operation === "dmp_segments.list")!;
    const error = await dispatchFailure(item, 403, DENIED);
    expect(error).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", requiredScopes: ["rw_dmp_segments"], program: "Matched Audiences API" });
    expect(error.message).toContain("Matched Audiences API");
  });

  it("429 is still rate limited on the pre-G1 modules", async () => {
    const item = cases.find((entry) => entry.operation === "organizations.page_statistics.get")!;
    const error = await dispatchFailure(item, 429, { status: 429 });
    expect(error.code).toBe("CONNECTOR_RATE_LIMITED");
  });
});
