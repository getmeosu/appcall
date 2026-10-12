import { describe, expect, test } from "bun:test";
import { createConnectorRegistry } from "../src/registry";
import { markOperationMetadata } from "../src/operation-metadata";

// PLAT-OUT-1 (codeant #667): the in-process budget measures the output the
// server actually sends, i.e. after the injected connector/action/source keys
// move to the result envelope. Near-limit outputs must not be rejected
// because of bytes the server strips.
const LIMIT = 1024;
const bare = (bytes: number) => {
  const overhead = JSON.stringify({ data: "" }).length;
  return { data: "x".repeat(bytes - overhead) };
};
function registryReturning(output: () => Record<string, unknown>) {
  return createConnectorRegistry({
    manifests: [{
      key: "budget",
      name: "Budget",
      version: "0.0.1",
      runtime: "bun",
      auth: { type: "none" },
      network: { allowedHosts: [] },
      operations: { "items.get": { kind: "action", timeoutMs: 1000, maxInputBytes: 1024, maxResponseBytes: LIMIT } },
    }],
    healthchecks: {},
    actions: { budget: { "items.get": output } },
    syncs: {},
  } as never);
}
function injected(bytes: number) {
  const metadata = { connector: "budget", action: "items.get", source: "provider" };
  return markOperationMetadata({ ...metadata, ...bare(bytes) }, Object.keys(metadata));
}
async function run(output: () => Record<string, unknown>) {
  try {
    const result = registryReturning(output).executeAction("budget", "items.get", {});
    if (!result.ok) return result;
    return { ok: true, output: await result.output };
  } catch (error) {
    return error as Record<string, unknown>;
  }
}

describe("PLAT-OUT-1 output budget excludes injected metadata", () => {
  test("an output exactly at the limit plus injected fields passes", async () => {
    expect(JSON.stringify(bare(LIMIT)).length).toBe(LIMIT);
    expect(JSON.stringify(injected(LIMIT)).length).toBeGreaterThan(LIMIT);
    const result = await run(() => injected(LIMIT));
    expect(result).toMatchObject({ ok: true });
  });

  test("an output one byte over the limit fails OUTPUT_TOO_LARGE", async () => {
    const result = await run(() => injected(LIMIT + 1));
    expect(result).toMatchObject({ code: "OUTPUT_TOO_LARGE" });
  });

  test("unmarked handler keys with the same names still count", async () => {
    const own = () => ({ connector: "mine", ...bare(LIMIT) });
    expect(await run(own)).toMatchObject({ code: "OUTPUT_TOO_LARGE" });
  });
});
