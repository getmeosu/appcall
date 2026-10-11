import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/better_stack/recipe.json"), "utf8"),
) as {
  selection: { operations: string[] };
  manifest: { operations: Record<string, unknown> };
};

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("better stack manifest", () => {
  it("keeps the public bearer contract and pinned provenance", () => {
    expect(manifest.key).toBe("better-stack");
    expect(manifest.visibility).toBe("public");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.network.allowedHosts).toEqual(["uptime.betterstack.com", "telemetry.betterstack.com"]);
    expect(manifest.provenance).toEqual({
      source: { url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" },
      evidence: { fixture: { status: "supplied" }, live: { status: "unverified" } },
    });
  });

  it("keeps EventOnly webhooks as read side effects", () => {
    const webhooks = Object.entries(operations).filter(([key]) => key.startsWith("webhook."));
    expect(webhooks.map(([key]) => key).sort()).toEqual([
      "webhook.incident_acknowledged",
      "webhook.incident_resolved",
      "webhook.incident_started",
      "webhook.on_call_change",
    ]);
    for (const [, operation] of webhooks) {
      expect(operation.kind).toBe("webhook");
      expect(operation.sideEffect).toBe("read");
      expect(String(operation.description)).toContain("EventOnly");
      expect(operation.request).toBeUndefined();
    }
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const actions = Object.entries(operations).filter(([, operation]) => operation.kind === "action");
    expect(actions.length).toBe(117);
    expect(Object.keys(operations)).toContain("healthcheck");
    expect(Object.keys(operations)).toContain("incidents.list");
    expect(Object.keys(operations)).toContain("heartbeats.create");
    expect(Object.keys(operations)).toContain("policies.create");
    expect(Object.keys(operations)).toContain("source-groups.create");
    expect(Object.keys(operations)).toContain("metadata.list");
    for (const [, operation] of actions) {
      expect(operation.kind).toBe("action");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema?.type).toBe("object");
      const request = operation.request as { method?: string; path?: string } | undefined;
      expect(request?.method).toMatch(/^(GET|POST|PATCH|PUT|DELETE)$/);
      expect(typeof request?.path).toBe("string");
      expect(String(request?.path).length).toBeGreaterThan(0);
    }
  });

  it("maps Composio Better Stack tools onto runner operations", () => {
    expect(mapping.composio_tools).toBe(117);
    expect(Object.keys(mapping.aligned).length).toBe(116);
    expect(mapping.skipped.BETTER_STACK_GET_UPTIME_API_TOKEN).toContain("no HTTP endpoint");
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
