import { expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import fixtures from "../fixtures/contracts.json";
const p=new URL("../manifest.json",import.meta.url);
const m=existsSync(p)?JSON.parse(readFileSync(p,"utf8")):{operations:{}};
it("declares complete bounded native action contracts and manual OAuth",()=>{
 expect(m.auth?.type).toBe("oauth2");expect(m.auth?.setup.mode).toBe("api_key");
 expect(m.http?.auth).toMatchObject({field:"accessToken",in:"query",name:"access_token"});
 expect(Object.keys(m.operations).sort()).toEqual(fixtures.map(f=>f.op).sort());
 for(const [key,op] of Object.entries(m.operations) as [string,any][]) {
  expect(op.kind).toBe("action");expect(op.inputSchema.type).toBe("object");expect(op.outputSchema.type).toBe("object");
  expect(op.outputSchema.required.length).toBeGreaterThan(0);expect(op.timeoutMs).toBeGreaterThan(0);
  expect(op.sideEffect).toBe(/create|publish$|schedule|update|delete/.test(key)?"write":"read");
  expect(op.request.query??{}).not.toHaveProperty("access_token");
 }
});
