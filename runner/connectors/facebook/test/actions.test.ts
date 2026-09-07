import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import cases from "../fixtures/contracts.json";
const manifestPath = new URL("../manifest.json", import.meta.url);
const exists = existsSync(manifestPath);
it("has an executable manifest", () => expect(exists).toBe(true));
const manifest = exists ? JSON.parse(readFileSync(manifestPath, "utf8")) : {operations:{}};
const { actions } = compileDeclarativeConnector(manifest);
for (const c of cases) describe(c.op, () => {
  it("validates without exposing undeclared data", async () => {
    expect(actions[c.op]).toBeFunction();
    const result = await actions[c.op]!({...c.input, unexpected:"ignored"});
    expect(result).toMatchObject(c.op === "healthcheck" ? {status:"ok"} : {validated:c.input});
    expect(JSON.stringify(result)).not.toContain("ignored");
  });
  it("uses the documented request and maps provider output", async () => {
    expect(actions[c.op]).toBeFunction();
    let calls = 0;
    const result = await actions[c.op]!({...c.input, accessToken:"fixture-token",pageId:"page123", fetch:async(url:unknown, init?:RequestInit)=>{
      calls++;
      expect(String(url)).toBe(manifest.http.baseUrl+c.path+(c.path.includes("?")?"&":"?")+"access_token=fixture-token");
      expect(init?.method).toBe(c.method);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBeNull();
      expect(headers.get("Content-Type")).toBe(c.body === null ? null : "application/json");
      expect(init?.body === undefined ? null : JSON.parse(String(init.body))).toEqual(c.body);
      return new Response(c.response === null ? null : JSON.stringify(c.response), {status:c.status});
    }});
    expect(calls).toBe(1);
    expect(result).toMatchObject(c.output);
  });
  it("returns a typed upstream failure", async()=>{
    expect(actions[c.op]).toBeFunction();
    await expect(actions[c.op]!({...c.input,accessToken:"fixture-token",pageId:"page123",fetch:async()=>new Response('{"message":"Forbidden","error_summary":"Forbidden"}',{status:403})})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});
  });
});
it("handles throttling and rejects provider error envelopes", async()=>{
  expect(actions.healthcheck).toBeFunction();
  await expect(actions.healthcheck!({accessToken:"fixture-token",fetch:async()=>new Response('{"error":{"message":"Quota exceeded"}}',{status:429,headers:{"retry-after":"12"}})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:12});
  await expect(actions.healthcheck!({accessToken:"fixture-token",fetch:async()=>Response.json({error:{message:"Invalid token",code:190}})})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});
});
it("rejects missing required write data before sending a request", async()=>{
  const operation=manifest.key==="threads"?"posts.publish":"posts.delete";
  expect(actions[operation]).toBeFunction();let calls=0;
  await expect(actions[operation]!({accessToken:"fixture-token",fetch:async()=>{calls++;return Response.json({});}})).rejects.toMatchObject({code:"INVALID_ACTION_INPUT"});
  expect(calls).toBe(0);
});

it("maps documented Graph throttling codes even on HTTP 400",async()=>{
 for(const code of [4,17]) await expect(actions.healthcheck!({accessToken:"fixture-token",fetch:async()=>Response.json({error:{code,message:"Too many calls"}},{status:400})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:60});
});
it("redacts query credentials reflected by transport and provider errors",async()=>{
 const token="private+/token value";
 for(const kind of ["transport","provider"]) {
  try {
   await actions.healthcheck!({accessToken:token,fetch:async(url:unknown)=>{
    const message=`failure ${String(url)} ${token} ${encodeURIComponent(token)}`;
    if(kind==="transport")throw new Error(message);
    return Response.json({error:{message,code:190}},{status:400});
   }});
   throw new Error("expected failure");
  }catch(error){
   expect(error).toMatchObject({code:kind==="transport"?"CONNECTOR_UNAVAILABLE":"CONNECTOR_UPSTREAM_ERROR"});
   const diagnostic=JSON.stringify(error);
   for(const forbidden of [token,encodeURIComponent(token),"private%2B%2Ftoken+value"]) expect(diagnostic).not.toContain(forbidden);
  }
 }
});
