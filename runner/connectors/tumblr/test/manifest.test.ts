import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";
it("declares manual bearer setup and complete action contracts", () => {
  expect(manifest.auth.type).toBe("bearer");
  expect(manifest.auth.setup.mode).toBe("api_key");
  expect(manifest.auth.setup.fields.find(f=>f.secret)?.key).toBe(manifest.http.auth.field);
  expect(manifest.network.allowedHosts).toEqual([new URL(manifest.http.baseUrl).hostname]);
  expect(Object.keys(manifest.operations).sort()).toEqual(cases.map(c=>c.op).sort());
  for(const [key,op] of Object.entries(manifest.operations)) {
    expect(op.kind).toBe("action");expect(op.description.length).toBeGreaterThan(10);
    expect(op.inputSchema.type).toBe("object");expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.sideEffect).toBe(/create|update|delete/.test(key)?"write":"read");
  }
});
