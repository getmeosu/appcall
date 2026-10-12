import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { normalizeGitHubHookConfig } from "../src/governance";

// TR-6b (v0.89.8, +0 ops): webhook-config url / content_type / insecure_ssl are all optional in pinned
// REST spec rest-api-description 58b1e0c0, so an absent field is null, not a fabricated ''. Every
// assertion below fails on v0.89.7 (TR-6 df22664b).

const ops = manifest.operations as Record<string, { outputSchema?: Record<string, any> }>;

describe("TR-6b: hook config optional fields", () => {
  test("absent url / content_type / insecure_ssl -> null; present values unchanged", () => {
    const c = normalizeGitHubHookConfig({} as never);
    expect([c.url, c.contentType, c.insecureSsl]).toEqual([null, null, null]);
    const full = normalizeGitHubHookConfig({ url: "https://x", content_type: "json", insecure_ssl: 0 } as never);
    expect([full.url, full.contentType, full.insecureSsl]).toEqual(["https://x", "json", "0"]);
  });

  for (const op of ["orgs.hooks.config.get", "repos.hooks.config.get"]) {
    test(`${op} output schema admits null`, () => {
      const props = ops[op]!.outputSchema!.properties.config.properties;
      for (const f of ["url", "contentType", "insecureSsl"]) expect(props[f].type).toContain("null");
    });
  }
});
