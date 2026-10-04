import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const { actions } = compileDeclarativeConnector(manifest as never);
const mock = (body: unknown, status=200) => { const calls: {url:string;init?:RequestInit}[]=[]; const fetch=async (u:RequestInfo|URL,i?:RequestInit)=>{calls.push({url:String(u),init:i}); return new Response(status===204?null:JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})}; return {calls,fetch}; };
const compiled = Object.keys(actions).sort();
describe("better stack declarative connector",()=>{
 it("compiles HTTP actions and skips EventOnly webhooks",()=>{
  expect(compiled).toEqual([
    "comments.create","comments.list","healthcheck","heartbeats.get","heartbeats.list",
    "incidents.acknowledge","incidents.get","incidents.list","incidents.resolve",
    "monitors.create","monitors.delete","monitors.get","monitors.list",
    "outgoing-webhooks.list","status-pages.get","status-pages.list","status-pages.resources.list",
  ].sort());
  expect(Object.keys(manifest.operations).filter((key)=>key.startsWith("webhook.")).sort()).toEqual([
    "webhook.incident_acknowledged","webhook.incident_resolved","webhook.incident_started","webhook.on_call_change",
  ]);
 });
 it("healthchecks with bearer auth and maps data",async()=>{const m=mock({data:[{id:"inc-1"}]}); const r=await actions.healthcheck!({apiKey:"secret",fetch:m.fetch}) as any; expect(m.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/incidents?per_page=1"); expect((m.calls[0]?.init?.headers as any).Authorization).toBe("Bearer secret"); expect(r.incidents).toEqual([{id:"inc-1"}]);});
 it("encodes incident IDs and rejects missing input",async()=>{const m=mock({data:{id:"a/b"}}); await actions["incidents.get"]!({apiKey:"x",incidentId:"a/b",fetch:m.fetch}); expect(m.calls[0]?.url).toContain("/incidents/a%2Fb"); await expect(actions["incidents.get"]!({apiKey:"x",fetch:m.fetch})).rejects.toThrow("incidentId is required");});
 it("lists monitors and maps pagination",async()=>{const m=mock({data:[{id:"2"}],pagination:{last:true}}); const r=await actions["monitors.list"]!({apiKey:"x",url:"https://example.com",fetch:m.fetch}) as any; expect(m.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/monitors?url=https%3A%2F%2Fexample.com"); expect(r.items).toEqual([{id:"2"}]); expect(r.pagination).toEqual({last:true});});
 it("creates a monitor with json body",async()=>{const m=mock({data:{id:"238",type:"monitor"}},201); const r=await actions["monitors.create"]!({apiKey:"x",url:"https://example.com",monitor_type:"status",fetch:m.fetch}) as any; expect(m.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/monitors"); expect(m.calls[0]?.init?.method).toBe("POST"); expect(String(m.calls[0]?.init?.body)).toBe("{\"url\":\"https://example.com\",\"monitor_type\":\"status\"}"); expect(r.resource).toEqual({id:"238",type:"monitor"});});
 it("acknowledges and resolves incidents",async()=>{const m=mock({data:{id:"25"}}); await actions["incidents.acknowledge"]!({apiKey:"x",incidentId:"25",acknowledged_by:"ops",fetch:m.fetch}); expect(m.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/incidents/25/acknowledge"); expect(String(m.calls[0]?.init?.body)).toBe("{\"acknowledged_by\":\"ops\"}"); const n=mock({data:{id:"25"}}); await actions["incidents.resolve"]!({apiKey:"x",incidentId:"25",fetch:n.fetch}); expect(n.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/incidents/25/resolve"); expect(String(n.calls[0]?.init?.body)).toBe("{}");});
 it("lists comments and status-page resources",async()=>{const m=mock({data:[{id:"123"}]}); const r=await actions["comments.list"]!({apiKey:"x",incidentId:"25",fetch:m.fetch}) as any; expect(m.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/incidents/25/comments"); expect(r.comments).toEqual([{id:"123"}]); const n=mock({data:[{id:"9"}],pagination:null}); const s=await actions["status-pages.resources.list"]!({apiKey:"x",statusPageId:"1",fetch:n.fetch}) as any; expect(n.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/status-pages/1/resources"); expect(s.items).toEqual([{id:"9"}]);});
 it("deletes monitors with 204",async()=>{const m=mock(null,204); const r=await actions["monitors.delete"]!({apiKey:"x",monitorId:"2",fetch:m.fetch}) as any; expect(m.calls[0]?.url).toBe("https://uptime.betterstack.com/api/v2/monitors/2"); expect(r.deleted).toBe(true); expect(r.id).toBe("2");});
});
