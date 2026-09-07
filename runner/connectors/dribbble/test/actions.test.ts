import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";
const { actions } = compileDeclarativeConnector(manifest as never);
for (const c of cases) describe(c.op, () => {
  it("validates without credentials", async () => {
    const r = await actions[c.op]!({...c.input, unexpected:"ignored"});
    expect(r).toMatchObject(c.op === "healthcheck" ? {status:"ok"} : {validated:c.input});
    expect(JSON.stringify(r)).not.toContain("ignored");
  });
  it("sends the documented URL, method, authentication and body", async () => {
    let count = 0;
    const r = await actions[c.op]!({...c.input, accessToken:"test-secret", fetch:async (url:unknown, init?:RequestInit) => {
      count++;
      expect(String(url)).toBe(manifest.http.baseUrl + c.path);
      expect(init?.method).toBe(c.method);
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-secret");
      expect(headers.get("Content-Type")).toBe("application/json");
      if(manifest.key === "tumblr") expect(headers.get("User-Agent")).toBe("appcall/0.1.0");
      expect(init?.body ? JSON.parse(String(init.body)) : null).toEqual(c.body);
      return new Response(c.response === null ? null : JSON.stringify(c.response), {status:c.status, headers:c.headers});
    }});
    expect(count).toBe(1);
    expect(r).toMatchObject(c.output);
  });
  it("surfaces upstream failures", async () => {
    await expect(actions[c.op]!({...c.input,accessToken:"test-secret",fetch:async()=>new Response(JSON.stringify({message:"Forbidden",meta:{msg:"Forbidden"}}),{status:403})})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR",message:expect.stringContaining("Forbidden")});
  });
});
it("uses the provider rate reset semantics", async () => {
  const headers = manifest.key === "dribbble" ? {"x-ratelimit-reset":String(Math.floor(Date.now()/1000)+30)} : {"retry-after":"30"};
  try {await actions["users.me"]!({accessToken:"test-secret",fetch:async()=>new Response("{}",{status:429,headers})});throw new Error("unexpected success");}
  catch(e) {expect(e).toMatchObject({code:"CONNECTOR_RATE_LIMITED"});const delay=(e as {retryAfterSeconds:number}).retryAfterSeconds;expect(delay).toBeGreaterThanOrEqual(28);expect(delay).toBeLessThanOrEqual(30);}
});
it("rejects missing identifiers before any request", async () => {
  const op = manifest.key === "tumblr" ? "posts.get" : "shots.get";
  let called = false;
  try {await actions[op]!({accessToken:"test-secret",fetch:async()=>{called=true;return new Response("{}");}});throw new Error("unexpected success");}
  catch(e) {expect(e).toMatchObject({code:"INVALID_ACTION_INPUT"});}
  expect(called).toBe(false);
});
it("omits unset paging parameters and the absent final-page Link", async () => {
  const result = await actions["shots.list"]!({accessToken:"test-secret",fetch:async(url:unknown)=>{
    expect(String(url)).toBe("https://api.dribbble.com/v2/user/shots");return new Response("[]");
  }});
  expect(result).toMatchObject({shots:[]});expect(result).not.toHaveProperty("paginationLink");
});
it("sends only supplied update fields, preserving false and empty arrays", async () => {
  await actions["shots.update"]!({id:45,lowProfile:false,tags:[],accessToken:"test-secret",fetch:async(_url:unknown,init?:RequestInit)=>{
    expect(JSON.parse(String(init?.body))).toEqual({low_profile:false,tags:[]});return new Response('{"id":45}');
  }});
});
it("falls back when reset timestamp is absent or expired", async () => {
  for(const reset of [undefined,"1"]) await expect(actions["users.me"]!({accessToken:"test-secret",fetch:async()=>new Response("{}",{status:429,headers:reset?{"x-ratelimit-reset":reset}:{}})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:60});
});
