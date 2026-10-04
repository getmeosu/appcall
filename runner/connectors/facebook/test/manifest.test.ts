import { expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import fixtures from "../fixtures/contracts.json";
const p=new URL("../manifest.json",import.meta.url);
const m=existsSync(p)?JSON.parse(readFileSync(p,"utf8")):{operations:{}};
const httpOps=Object.fromEntries(Object.entries(m.operations as Record<string,any>).filter(([,op])=>op.kind!=="webhook"));
it("declares complete bounded native action contracts and manual OAuth",()=>{
 expect(m.auth?.type).toBe("oauth2");expect(m.auth?.setup.mode).toBe("api_key");
 expect(m.http?.auth).toMatchObject({field:"accessToken",in:"query",name:"access_token"});
 expect(Object.keys(httpOps).sort()).toEqual(fixtures.map(f=>f.op).sort());
 for(const [key,op] of Object.entries(httpOps) as [string,any][]) {
  expect(op.kind).toBe("action");expect(op.inputSchema.type).toBe("object");expect(op.outputSchema.type).toBe("object");
  expect(op.outputSchema.required.length).toBeGreaterThan(0);expect(op.timeoutMs).toBeGreaterThan(0);
  expect(op.sideEffect).toBe(/create|publish$|schedule|update|delete/.test(key)?"write":"read");
  expect(op.request.query??{}).not.toHaveProperty("access_token");
 }
});
it("declares EventOnly Page webhooks",()=>{
 const webhooks=Object.entries(m.operations as Record<string,any>).filter(([,op])=>op.kind==="webhook");
 expect(webhooks.map(([key])=>key).sort()).toEqual(["webhook.comments","webhook.feed","webhook.mention","webhook.ratings"]);
 for(const [,op] of webhooks) {
  expect(op.request).toBeUndefined();
  expect(op.title).toBeString();
  expect(op.description.length).toBeGreaterThan(0);
 }
});
