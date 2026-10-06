import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const actionOps = Object.entries(operations).filter(([, op]) => op.kind === "action");
const WEBHOOK_OPS = ["webhook.file_uploaded", "webhook.file_downloaded", "webhook.folder_created"];
const CURATED = cases.map((entry) => entry.op);

it("declares OAuth2 with manually collected credentials and bounded action schemas",()=>{
  expect(manifest.auth?.type).toBe("oauth2");
  expect(manifest.auth?.setup.mode).toBe("api_key");
  expect(manifest.auth?.setup.fields).toContainEqual(expect.objectContaining({key:"accessToken",secret:true,required:true}));
  expect(manifest.http?.auth.field).toBe("accessToken");
  expect(manifest.version).toBe("0.4.0");
  const keys = actionOps.map(([key]) => key);
  expect(new Set(keys).size).toBe(keys.length);
  for (const op of CURATED) expect(keys).toContain(op);
  expect(keys.length).toBeGreaterThan(CURATED.length);
  for(const [key,op] of actionOps) {
    expect((op.inputSchema as {type:string}).type).toBe("object");
    expect((op.outputSchema as {type:string}).type).toBe("object");
    expect(op.kind).toBe("action");
    expect(op.timeoutMs as number).toBeGreaterThan(0);
    expect(op.maxResponseBytes as number).toBeLessThanOrEqual(5242880);
    expect(String(op.title ?? "").length).toBeGreaterThan(0);
    expect(String(op.description ?? "").length).toBeGreaterThan(0);
    const method = String((op.request as {method?:string}).method ?? "").toUpperCase();
    expect(op.sideEffect, key).toBe(method === "GET" || method === "HEAD" || method === "OPTIONS" ? "read" : "write");
    if (!CURATED.includes(key)) {
      expect(op.enforceOutputSchema, key).toBe(true);
      expect(op.responseFormat, key).toBe("json");
      expect(op.validationMode, key).toBe("strict-generated");
      const output = op.outputSchema as {additionalProperties?:boolean; required?:string[]; properties?:Record<string,unknown>};
      expect(output.additionalProperties, key).toBe(false);
      expect(output.required, key).toEqual(["data"]);
      expect(output.properties?.data).toBeDefined();
    }
  }
  for (const key of CURATED) {
    expect(operations[key]?.sideEffect).toBe(/create|move|delete|update|copy|upload/.test(key)?"write":"read");
  }
  expect(manifest.network?.allowedHosts).toEqual(["api.box.com", "dl.boxcloud.com", "upload.box.com"]);
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
