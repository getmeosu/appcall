import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";
it("has complete declarative contracts",()=>{
 expect(manifest.auth.setup.fields.find(f=>f.secret)?.key).toBe(manifest.http.auth.field);
 expect(manifest.network.allowedHosts).toContain(new URL(manifest.http.baseUrl).hostname);
 expect(Object.keys(manifest.operations).sort()).toEqual(cases.map(c=>c.op).sort());
 for(const [key,op] of Object.entries(manifest.operations)){
  expect(op.kind).toBe("action");expect(op.description.length).toBeGreaterThan(10);
  expect(op.inputSchema.type).toBe("object");expect(op.timeoutMs).toBeGreaterThan(0);
  expect(op.sideEffect).toBe(/create|update|publish/.test(key)?"write":"read");
 }
});
