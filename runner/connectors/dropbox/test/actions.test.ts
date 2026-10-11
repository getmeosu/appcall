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
    if (manifest.operations[c.op].validationMode === "strict-generated") {
      expect(() => actions[c.op]!({...c.input, unexpected:"ignored"})).toThrow(/Unsupported input field/);
      return;
    }
    const result = await actions[c.op]!({...c.input, unexpected:"ignored"});
    expect(result).toMatchObject(c.op === "healthcheck" ? {status:"ok"} : {validated:c.input});
    expect(JSON.stringify(result)).not.toContain("ignored");
  });
  it("uses the documented request and maps provider output", async () => {
    expect(actions[c.op]).toBeFunction();
    let calls = 0;
    const result = await actions[c.op]!({...c.input, accessToken:"fixture-token", fetch:async(url:unknown, init?:RequestInit)=>{
      calls++;
      const request = manifest.operations[c.op].request;
      const base = typeof request.baseUrl === "string" ? request.baseUrl.replace(/\/$/, "") : manifest.http.baseUrl;
      expect(String(url)).toBe(base+c.path);
      expect(init?.method).toBe(c.method);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer fixture-token");
      const declaredType = request.headers?.["Content-Type"];
      expect(headers.get("Content-Type")).toBe(typeof declaredType === "string" ? declaredType : null);
      if (request.bodyEncoding === "raw") expect(init?.body == null ? null : String(init.body)).toBe(c.body);
      else expect(init?.body == null ? null : JSON.parse(String(init.body))).toEqual(c.body);
      if (c.arg !== undefined) expect(headers.get("Dropbox-API-Arg")).toBe(JSON.stringify(c.arg));
      const payload = c.response === null ? null : request.responseFormat === "text" || manifest.operations[c.op].responseFormat === "text" ? String(c.response) : JSON.stringify(c.response);
      return new Response(payload, {status:c.status});
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
it("rejects missing copy identifiers before dispatch", async()=>{
  expect(actions["files.copy"]).toBeFunction();
  let called=false;
  await expect(actions["files.copy"]!({accessToken:"fixture-token",fetch:async()=>{called=true;return new Response('{}');}})).rejects.toMatchObject({code:"INVALID_ACTION_INPUT"});
  expect(called).toBe(false);
});
it("omits unset shared-link settings", async () => {
  const result = await actions["sharing.createSharedLink"]!({path:"/notes.txt",accessToken:"fixture-token",fetch:async(_url:unknown,init?:RequestInit)=>{
    expect(JSON.parse(String(init?.body))).toEqual({path:"/notes.txt"});
    return new Response(JSON.stringify({"url":"https://www.dropbox.com/s/abc/notes.txt","name":"notes.txt","path_lower":"/notes.txt",".tag":"file"}));
  }});
  expect(result).toMatchObject({link:{url:"https://www.dropbox.com/s/abc/notes.txt"}});
});
