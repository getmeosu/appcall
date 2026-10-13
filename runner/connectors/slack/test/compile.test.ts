import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const recipePath = join(import.meta.dir, "../../recipes/slack/recipe.json");

describe("slack recipe compile", () => {
  it("compiles recipe action requests and keeps GET healthcheck body-less", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      manifest: {
        key: string;
        version: string;
        operations: Record<string, {
          kind?: string;
          sideEffect?: string;
          request?: { method?: string; headers?: Record<string, string>; body?: unknown; bodyEncoding?: string };
        }>;
      };
    };
    // The curated recipe mirrors the runner manifest; the wave integrator may
    // still be one revision behind.
    expect(["0.6.0", (manifest as { version: string }).version]).toContain(recipe.manifest.version);
    const compiled = compileDeclarativeConnector(recipe.manifest as never);
    const actionOps = Object.entries(recipe.manifest.operations).filter(([, op]) => op.kind === "action");
    expect(Object.keys(compiled.actions).length).toBe(actionOps.length);
    expect(compiled.actions["healthcheck"]).toBeTypeOf("function");
    expect(compiled.actions["assistant.search.context"]).toBeTypeOf("function");
    expect(compiled.actions["agents.conversations.create"]).toBeTypeOf("function");

    const healthcheck = recipe.manifest.operations.healthcheck?.request;
    expect(healthcheck?.method).toBe("GET");
    expect(healthcheck?.body).toBeUndefined();
    expect(healthcheck?.headers?.["Content-Type"]).toBeUndefined();

    for (const [key, operation] of Object.entries(recipe.manifest.operations)) {
      if (operation.kind !== "action" || !operation.request) continue;
      const request = operation.request;
      if (request.method === "GET" || request.method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      } else if (request.body !== undefined) {
        expect(request.headers?.["Content-Type"], key).toBe(
          request.bodyEncoding === "form" ? "application/x-www-form-urlencoded" : "application/json",
        );
      } else {
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      }
    }
  });

  it("keeps runner and recipe operation catalogs at Composio depth", () => {
    const ops = Object.keys((manifest as { operations: Record<string, unknown> }).operations);
    expect(ops).toHaveLength(223);
    expect(ops).toContain("agents.sessions.setStatus");
    expect(ops).toContain("assistant.search.info");
    expect(ops).toContain("admin.conversations.invite");
    expect(ops).toContain("search.messages");
    expect(ops).not.toContain("users.setPhoto");
  });
});
