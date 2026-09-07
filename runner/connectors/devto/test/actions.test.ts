import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";
const { actions } = compileDeclarativeConnector(manifest as never);
for (const c of cases) describe(c.op, () => {
 it("validates without credentials", async () => {
   const r = await actions[c.op]!({...c.input, unknown: "ignored"});
   expect(r).toMatchObject(c.op === "healthcheck" ? {status:"ok"} : {validated:c.input});
   expect(JSON.stringify(r)).not.toContain("ignored");
 });
 it("sends the documented request and maps its response", async () => {
   const calls: {url:string, init?:RequestInit}[]=[];
   const r=await actions[c.op]!({...c.input, apiKey:"test-secret", fetch:async (url:unknown,init?:RequestInit)=>{
    calls.push({url:String(url),init}); return new Response(JSON.stringify(c.response),{status:c.op === "articles.create" ? 201:200});
   }});
   expect(calls).toHaveLength(1);
   expect(calls[0]!.url).toBe(manifest.http.baseUrl+c.path);
   expect(calls[0]!.init?.method).toBe(c.method);
   const headers = new Headers(calls[0]!.init?.headers);
   expect(headers.get(manifest.http.auth.name)).toBe(manifest.key === "devto" ? "test-secret":"Bearer test-secret");
   if(manifest.key === "devto") expect(headers.get("Accept")).toBe("application/vnd.forem.api-v1+json");
   expect(calls[0]!.init?.body ? JSON.parse(String(calls[0]!.init?.body)):null).toEqual(c.body);
   expect(r).toMatchObject(c.output);
 });
 it("surfaces provider errors", async () => {
   await expect(actions[c.op]!({...c.input,apiKey:"test-secret",fetch:async()=>new Response(JSON.stringify({error:"Denied",errors:[{message:"Denied"}]}),{status:403})})).rejects.toMatchObject({code:"CONNECTOR_UPSTREAM_ERROR"});
 });
});
it("handles throttling", async()=>{
 await expect(actions["users.me"]!({apiKey:"test-secret",fetch:async()=>new Response("{}",{status:429,headers:{"retry-after":"12"}})})).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED",retryAfterSeconds:12});
});
it("rejects missing required input before network", async()=>{
 let called=false;
 const op=manifest.key === "devto" ? "articles.get":"posts.get";
 try {await actions[op]!({apiKey:"test-secret",fetch:async()=>{called=true;return new Response("{}");}});throw new Error("unexpected success");}
 catch(e){expect(e).toMatchObject({code:"INVALID_ACTION_INPUT"});}
 expect(called).toBe(false);
});
it("omits optional pagination/filter values and preserves empty final page",async()=>{
 const r=await actions["articles.list"]!({apiKey:"test-secret",fetch:async(url:unknown)=>{
  expect(String(url)).toBe("https://dev.to/api/articles");return new Response("[]");
 }});expect(r).toMatchObject({articles:[]});
});
