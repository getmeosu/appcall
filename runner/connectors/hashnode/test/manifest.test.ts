import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("has complete declarative contracts", () => {
  expect(manifest.auth.setup.fields.find((field: { secret?: boolean }) => field.secret)?.key).toBe(manifest.http.auth.field);
  expect(manifest.network.allowedHosts).toContain(new URL(manifest.http.baseUrl).hostname);
  for (const [key, op] of Object.entries(manifest.operations) as Array<[string, Record<string, unknown>]>) {
    expect(typeof op.description).toBe("string");
    expect(String(op.description).length).toBeGreaterThan(10);
    expect(Number(op.timeoutMs)).toBeGreaterThan(0);
    if (key.startsWith("webhook.")) {
      expect(op.kind).toBe("webhook");
      expect(op.request).toBeUndefined();
      continue;
    }
    expect(op.kind).toBe("action");
    expect((op.inputSchema as { type?: string }).type).toBe("object");
    if (/remove|delete/.test(key)) expect(op.sideEffect).toBe("destructive");
    else if (/create|update|publish|submit/.test(key)) expect(op.sideEffect).toBe("write");
    else expect(op.sideEffect).toBe("read");
  }
});
