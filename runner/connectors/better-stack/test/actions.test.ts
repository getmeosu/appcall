import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const { actions } = compileDeclarativeConnector(manifest as never);
const mock = (body: unknown, status=200) => { const calls: {url:string;init?:RequestInit}[]=[]; const fetch=async (u:RequestInfo|URL,i?:RequestInit)=>{calls.push({url:String(u),init:i}); return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})}; return {calls,fetch}; };
describe("better stack declarative connector",()=>{
 it("compiles all reads",()=>expect(Object.keys(actions).sort()).toEqual(["healthcheck","incidents.get","incidents.list"]));
 it("healthchecks with bearer auth and maps data",async()=>{const m=mock({data:[{id:"inc-1"}]}); const r=await actions.healthcheck!({apiKey:"secret",fetch:m.fetch}) as any; expect(m.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/incidents?per_page=1"); expect((m.calls[0]?.init?.headers as any).Authorization).toBe("Bearer secret"); expect(r.incidents).toEqual([{id:"inc-1"}]);});
 it("encodes incident IDs and rejects missing input",async()=>{const m=mock({data:{id:"a/b"}}); await actions["incidents.get"]!({apiKey:"x",incidentId:"a/b",fetch:m.fetch}); expect(m.calls[0]?.url).toContain("/incidents/a%2Fb"); await expect(actions["incidents.get"]!({apiKey:"x",fetch:m.fetch})).rejects.toThrow("incidentId is required");});
});
