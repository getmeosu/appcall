import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";
describe("better stack manifest",()=>it("has bounded public bearer contract, EventOnly webhooks, and exact provenance",()=>{
  expect(manifest.key).toBe("better-stack");
  expect(manifest.visibility).toBe("public");
  expect(manifest.version).toBe("0.2.0");
  expect(manifest.http.auth.field).toBe("apiKey");
  expect(manifest.network.allowedHosts).toEqual(["uptime.betterstack.com"]);
  expect(manifest.provenance).toEqual({source:{url:"https://github.com/oomol-lab/open-connector",revision:"33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a"},evidence:{fixture:{status:"supplied"},live:{status:"unverified"}}});
  expect(Object.keys(manifest.operations).sort()).toEqual([
    "comments.create","comments.list","healthcheck","heartbeats.get","heartbeats.list",
    "incidents.acknowledge","incidents.get","incidents.list","incidents.resolve",
    "monitors.create","monitors.delete","monitors.get","monitors.list",
    "outgoing-webhooks.list","status-pages.get","status-pages.list","status-pages.resources.list",
    "webhook.incident_acknowledged","webhook.incident_resolved","webhook.incident_started","webhook.on_call_change",
  ].sort());
  for (const [key, op] of Object.entries(manifest.operations) as Array<[string, any]>) {
    if (key.startsWith("webhook.")) {
      expect(op.kind).toBe("webhook");
      expect(op.description).toContain("EventOnly");
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.enforceOutputSchema).toBe(true);
    expect(["read","write","destructive"]).toContain(op.sideEffect);
  }
}));
