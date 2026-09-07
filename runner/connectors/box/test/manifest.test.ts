import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";
it("declares OAuth2 with manually collected credentials and bounded action schemas",()=>{
  expect(manifest.auth?.type).toBe("oauth2");
  expect(manifest.auth?.setup.mode).toBe("api_key");
  expect(manifest.auth?.setup.fields).toContainEqual(expect.objectContaining({key:"accessToken",secret:true,required:true}));
  expect(manifest.http?.auth.field).toBe("accessToken");
  expect(Object.keys(manifest.operations).sort()).toEqual(cases.map(c=>c.op).sort());
  for(const [key,op] of Object.entries(manifest.operations) as [string,any][]) {
    expect(op.inputSchema.type).toBe("object");expect(op.outputSchema.type).toBe("object");
    expect(op.kind).toBe("action");expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    expect(op.sideEffect).toBe(/create|move|delete/.test(key)?"write":"read");
  }
  expect(manifest.network?.allowedHosts).toEqual([new URL(manifest.http.baseUrl).hostname]);
});

it("requires the fields guaranteed by each mapped response", () => {
  for (const op of Object.values(manifest.operations)) {
    const schema = op.outputSchema as {properties:Record<string,unknown>;required?:string[]};
    expect(schema.required?.sort()).toEqual(Object.keys(schema.properties).filter(key=>key!=="nextMarker").sort());
  }
  const identity = manifest.operations.healthcheck.outputSchema.properties.user as {required?:string[];properties?:Record<string,unknown>};
  expect(identity.required).toContain("id");
  expect(identity.properties?.id).toMatchObject({type:"string",minLength:1});
});
