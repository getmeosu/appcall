import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.0");
  expect(manifest.http?.auth.field).toBe("apiKey");
  expect(manifest.network?.allowedHosts).toEqual(["rt.ambientweather.net", "lightning.ambientweather.net"]);
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.sideEffect).toBe("read");
      expect(op.request).toBeUndefined();
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.sideEffect).toBe(false ? "destructive" : false ? "write" : "read");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
});
