// HC-SCHEMA-1 guard: every healthcheck's declared outputSchema covers what the
// healthcheck returns as result.output on connector.action.execute (bookkeeping
// keys connector/action/status/source move to the envelope unless declared),
// and connector.healthcheck always carries `status` for the control plane.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defaultConnectorRegistry } from "../src/registry";
import { splitOperationMetadata } from "../src/operation-metadata";
import { assertOutputSchema } from "../src/declarative/validate";

// Owned by HEALTH-1 (bolt) / out of scope for HC-SCHEMA-1.
const EXCLUDED = new Set([
  "quickbooks", "hubspot", "mailchimp", "tiktok-ads", "shopify", "xero", "google-ads", "meta-ads",
  "google-workspace", "microsoft-365", "linkedin", "jira", "typeform", "woocommerce", "zoho-books",
  "recruitee", "rb2b", "smtp-email", "workable", "greenhouse",
]);

const root = join(import.meta.dir, "../../connectors");
type Manifest = { key: string; operations?: Record<string, { outputSchema?: Record<string, unknown> }> };
const manifests: Manifest[] = readdirSync(root)
  .map((dir) => join(root, dir, "manifest.json"))
  .filter((path) => existsSync(path))
  .map((path) => JSON.parse(readFileSync(path, "utf8")) as Manifest)
  .filter((m) => m.operations?.healthcheck?.outputSchema && !EXCLUDED.has(m.key));

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async () => { throw new Error("network disabled in HC-SCHEMA-1 guard"); }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

async function settle(result: { ok: boolean; output?: unknown } | undefined): Promise<{ value?: unknown; skipped?: boolean }> {
  if (!result?.ok) return { skipped: true };
  try {
    return { value: await (result as { output: unknown }).output };
  } catch {
    return { skipped: true };
  }
}

describe("HC-SCHEMA-1 healthcheck output schemas", () => {
  test("covers a meaningful set of connectors", () => {
    expect(manifests.length).toBeGreaterThan(300);
  });

  // The no-credential path is the fixture-safe echo ("never surfaces from a
  // real action", declarative/compile.ts), so only its bookkeeping is checked:
  // connector/action/status/source must never reach result.output undeclared.
  test("bookkeeping keys never reach result.output unless the schema declares them", async () => {
    const leaks: string[] = [];
    let checked = 0;
    for (const manifest of manifests) {
      const { value, skipped } = await settle(defaultConnectorRegistry.executeAction(manifest.key, "healthcheck", {}) as never);
      if (skipped) continue;
      checked += 1;
      const { output } = splitOperationMetadata(value);
      const declared = Object.keys((manifest.operations!.healthcheck!.outputSchema!.properties ?? {}) as object);
      for (const key of ["connector", "action", "status", "source"]) {
        if (output && typeof output === "object" && Object.hasOwn(output, key) && !declared.includes(key)) leaks.push(`${manifest.key}.${key}`);
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(leaks).toEqual([]);
  });

  // Credentialed path (what a real Test / action returns): every top-level key
  // of result.output must be covered by the declared outputSchema.
  test("credentialed healthcheck result.output keys are covered by the declared outputSchema", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const uncovered: string[] = [];
    let checked = 0;
    try {
      for (const manifest of manifests) {
        const field = (manifest as { http?: { auth?: { field?: string } } }).http?.auth?.field;
        if (!field) continue;
        const { value, skipped } = await settle(defaultConnectorRegistry.executeAction(manifest.key, "healthcheck", { [field]: "synthetic" }) as never);
        if (skipped) continue;
        const { output } = splitOperationMetadata(value);
        if (!output || typeof output !== "object" || Array.isArray(output)) continue;
        checked += 1;
        const schema = manifest.operations!.healthcheck!.outputSchema!;
        if (schema.additionalProperties !== false) continue;
        const declared = Object.keys((schema.properties ?? {}) as object);
        for (const key of Object.keys(output)) if (!declared.includes(key)) uncovered.push(`${manifest.key}.${key}`);
      }
    } finally {
      globalThis.fetch = (async () => { throw new Error("network disabled"); }) as unknown as typeof fetch;
    }
    expect(checked).toBeGreaterThan(200);
    expect(uncovered).toEqual([]);
  });

  test("connector.healthcheck keeps status (and source) for the control plane", async () => {
    const missing: string[] = [];
    for (const manifest of manifests) {
      const { value, skipped } = await settle(defaultConnectorRegistry.healthcheck(manifest.key, {}) as never);
      if (skipped) continue;
      if (typeof (value as Record<string, unknown>)?.status !== "string") missing.push(manifest.key);
    }
    expect(missing).toEqual([]);
  });

  test("credentialed declarative probe: status is added, bookkeeping leaves result.output", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ object: "user", id: "u" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
    try {
      const health = await settle(defaultConnectorRegistry.healthcheck("notion", { notionToken: "synthetic" }) as never);
      expect(health.value).toMatchObject({ status: "ok", source: "provider", data: { id: "u" } });
      const action = await settle(defaultConnectorRegistry.executeAction("notion", "healthcheck", { notionToken: "synthetic" }) as never);
      const { output, metadata } = splitOperationMetadata(action.value);
      expect(output).toEqual({ data: { object: "user", id: "u" } });
      expect(metadata).toMatchObject({ connector: "notion", action: "healthcheck", source: "provider", status: "ok" });
      const notion = manifests.find((m) => m.key === "notion")!;
      expect(() => assertOutputSchema(output, notion.operations!.healthcheck!.outputSchema as never)).not.toThrow();
    } finally {
      globalThis.fetch = (async () => { throw new Error("network disabled"); }) as unknown as typeof fetch;
    }
  });

  test("a declared bookkeeping key stays in result.output", async () => {
    const { normalizeHealthcheckOutput } = await import("../src/registry");
    const out = normalizeHealthcheckOutput({ connector: "x", status: "ok", source: "connector" }, new Set(["status"]));
    const { output, metadata } = splitOperationMetadata(out);
    expect(output).toEqual({ status: "ok" });
    expect(metadata).toEqual({ connector: "x", source: "connector" });
  });
});
