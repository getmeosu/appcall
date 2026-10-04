import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.0");
  expect(manifest.http?.auth.field).toBe("accessToken");
  expect(manifest.network?.allowedHosts).toEqual(["sentry.io"]);
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.kind).toBe("action");
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    expect(op.sideEffect).toBe(/create|update|delete/.test(key) ? "write" : "read");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
});
