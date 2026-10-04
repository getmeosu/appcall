import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const actionOps = Object.entries(operations).filter(([, op]) => op.kind === "action");
const WEBHOOK_OPS = ["webhook.file_uploaded", "webhook.file_downloaded", "webhook.folder_created"];

it("declares OAuth2 with manually collected credentials and bounded action schemas",()=>{
  expect(manifest.auth?.type).toBe("oauth2");
  expect(manifest.auth?.setup.mode).toBe("api_key");
  expect(manifest.auth?.setup.fields).toContainEqual(expect.objectContaining({key:"accessToken",secret:true,required:true}));
  expect(manifest.http?.auth.field).toBe("accessToken");
  expect(manifest.version).toBe("0.2.0");
  expect(actionOps.map(([key]) => key).sort()).toEqual(cases.map(c=>c.op).sort());
  for(const [key,op] of actionOps) {
    expect((op.inputSchema as {type:string}).type).toBe("object");
    expect((op.outputSchema as {type:string}).type).toBe("object");
    expect(op.kind).toBe("action");
    expect(op.timeoutMs as number).toBeGreaterThan(0);
    expect(op.maxResponseBytes as number).toBeLessThanOrEqual(5242880);
    expect(String(op.title ?? "").length).toBeGreaterThan(0);
    expect(String(op.description ?? "").length).toBeGreaterThan(0);
    expect(op.sideEffect).toBe(/create|move|delete|update|copy|upload/.test(key)?"write":"read");
  }
  expect(manifest.network?.allowedHosts).toEqual(["api.box.com", "upload.box.com"]);
});

it("requires the fields guaranteed by each mapped response", () => {
  for (const [key, op] of actionOps) {
    const schema = op.outputSchema as {properties:Record<string,unknown>;required?:string[]};
    expect(schema.required?.sort(), key).toEqual(Object.keys(schema.properties).filter(field=>field!=="nextMarker" && field!=="downloadUrl").sort());
  }
  const identity = manifest.operations.healthcheck.outputSchema.properties.user as {required?:string[];properties?:Record<string,unknown>};
  expect(identity.required).toContain("id");
  expect(identity.properties?.id).toMatchObject({type:"string",minLength:1});
});

it("declares EventOnly file and folder webhook triggers", () => {
  for (const key of WEBHOOK_OPS) {
    expect(operations[key]).toMatchObject({
      kind: "webhook",
      timeoutMs: 30000,
      maxInputBytes: 1048576,
      maxResponseBytes: 1048576,
    });
    expect(operations[key]!.inputSchema).toBeUndefined();
    expect(operations[key]!.request).toBeUndefined();
  }
});
