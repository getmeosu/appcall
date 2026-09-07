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
    const result = await actions[c.op]!({...c.input, accessToken:"fixture-token", fetch:async(url:unknown, init?:RequestInit)=>{
      calls++;
      expect(String(url)).toBe(manifest.http.baseUrl+c.path);
      expect(init?.method).toBe(c.method);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer fixture-token");
      expect(headers.get("Content-Type")).toBe(c.body === null ? null : "application/json");
      expect(init?.body === undefined ? null : JSON.parse(String(init.body))).toEqual(c.body);
      return new Response(c.response === null ? null : JSON.stringify(c.response), {status:c.status});
    }});
    expect(calls).toBe(1);
    expect(result).toMatchObject(c.output);
  });
  it("returns a typed upstream failure", async()=>{
    expect(actions[c.op]).toBeFunction();
    await expect(actions[c.op]!({...c.input,accessToken:"fixture-token",fetch:async()=>new Response('{"message":"Forbidden","error_summary":"Forbidden"}',{status:403})})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});
  });
});
it("honors Retry-After for throttling", async()=>{
  expect(actions.healthcheck).toBeFunction();
  await expect(actions.healthcheck!({accessToken:"fixture-token",fetch:async()=>new Response('{}',{status:429,headers:{"retry-after":"17"}})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:17});
});
it("rejects missing write identifiers before dispatch", async()=>{
  expect(actions["files.delete"]).toBeFunction();
  let called=false;
  await expect(actions["files.delete"]!({accessToken:"fixture-token",fetch:async()=>{called=true;return new Response('{}');}})).rejects.toMatchObject({code:"INVALID_ACTION_INPUT"});
  expect(called).toBe(false);
});
it("sends an explicit empty root path while omitting unset options", async () => {
  const result = await actions["root.list"]!({accessToken:"fixture-token",fetch:async(_url:unknown,init?:RequestInit)=>{
    expect(JSON.parse(String(init?.body))).toEqual({path:""});
    return new Response('{"entries":[],"cursor":"saved","has_more":false}');
  }});
  expect(result).toMatchObject({entries:[],cursor:"saved",hasMore:false});
});
it("rejects an empty required folder path before dispatch", async()=>{
  let called=false;
  await expect(actions["folders.list"]!({path:"",accessToken:"fixture-token",fetch:async()=>{called=true;return new Response('{}');}})).rejects.toMatchObject({code:"INVALID_ACTION_INPUT"});
  expect(called).toBe(false);
});
