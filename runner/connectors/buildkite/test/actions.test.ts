import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const { actions } = compileDeclarativeConnector(manifest as never);
const mock = (body: unknown, status=200) => { const calls: {url:string;init?:RequestInit}[]=[]; const fetch=async (u:RequestInfo|URL,i?:RequestInit)=>{calls.push({url:String(u),init:i}); return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})}; return {calls,fetch}; };
describe("buildkite declarative connector",()=>{
 it("compiles all reads",()=>expect(Object.keys(actions).sort()).toEqual(["builds.list","healthcheck","organizations.list","pipelines.list"]));
 it("healthchecks with bearer auth",async()=>{const m=mock([{id:"org"}]); const r=await actions.healthcheck!({apiKey:"secret",fetch:m.fetch}) as any; expect(m.calls[0]?.url).toBe("https://api.buildkite.com/v2/organizations?per_page=1"); expect((m.calls[0]?.init?.headers as any).Authorization).toBe("Bearer secret"); expect(r.status).toBe("ok");});
 it("encodes scoped pipeline path and validates required fields",async()=>{const m=mock([]); await actions["builds.list"]!({apiKey:"x",orgSlug:"acme org",pipelineSlug:"web/api",fetch:m.fetch}); expect(m.calls[0]?.url).toContain("/organizations/acme%20org/pipelines/web%2Fapi/builds"); await expect(actions["builds.list"]!({apiKey:"x",orgSlug:"acme",fetch:m.fetch})).rejects.toThrow("pipelineSlug is required");});
});
