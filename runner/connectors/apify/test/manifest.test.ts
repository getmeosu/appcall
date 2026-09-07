import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("apify connector manifest", () => {
  test("declares key, name, runtime, version", () => {
    expect(manifest.key).toBe("apify");
    expect(manifest.name).toBe("Apify");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  test("auth is api_key with apiKey field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields).toHaveLength(1);
    expect(manifest.auth.setup.fields[0].key).toBe("apiKey");
    expect(manifest.auth.setup.fields[0].required).toBe(true);
    expect(manifest.auth.setup.fields[0].secret).toBe(true);
  });

  test("network allows api.apify.com only", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.apify.com"]);
  });

  test("categories include utility", () => {
    expect(manifest.categories).toContain("utility");
  });

  test("models include actor, run, dataset", () => {
    expect(manifest.models).toContain("actor");
    expect(manifest.models).toContain("run");
    expect(manifest.models).toContain("dataset");
  });

  test("healthcheck is an action op", () => {
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].timeoutMs).toBe(5000);
  });

  test("all action operations have title and description", () => {
    const ops = manifest.operations as Record<string, { kind: string; title?: string; description?: string }>;
    const actionKeys = Object.keys(ops).filter((k) => ops[k].kind === "action");
    expect(actionKeys.length).toBeGreaterThan(0);
    for (const key of actionKeys) {
      expect(typeof ops[key].title).toBe("string");
      expect((ops[key].title as string).length).toBeGreaterThan(0);
      expect(typeof ops[key].description).toBe("string");
      expect((ops[key].description as string).length).toBeGreaterThan(0);
    }
  });

  test("all action operations have timeoutMs, maxInputBytes, maxResponseBytes > 0", () => {
    const ops = manifest.operations as Record<string, { kind: string; timeoutMs: number; maxInputBytes: number; maxResponseBytes: number }>;
    const actionKeys = Object.keys(ops).filter((k) => ops[k].kind === "action");
    for (const key of actionKeys) {
      expect(ops[key].timeoutMs).toBeGreaterThan(0);
      expect(ops[key].maxInputBytes).toBeGreaterThan(0);
      expect(ops[key].maxResponseBytes).toBeGreaterThan(0);
    }
  });

  test("all action operations have object inputSchema with required array", () => {
    const ops = manifest.operations as Record<string, { kind: string; inputSchema?: { type: string; required?: unknown[] } }>;
    const actionKeys = Object.keys(ops).filter((k) => ops[k].kind === "action");
    for (const key of actionKeys) {
      expect(ops[key].inputSchema).toBeDefined();
      expect(ops[key].inputSchema!.type).toBe("object");
      expect(Array.isArray(ops[key].inputSchema!.required)).toBe(true);
    }
  });

  test("declares actors.input_schema as a read action taking actorId", () => {
    const op = (manifest.operations as Record<string, any>)["actors.input_schema"];
    expect(op).toBeDefined();
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("read");
    expect(op.inputSchema.properties.actorId).toBeDefined();
    expect(op.inputSchema.required).toContain("actorId");
  });

  test("declares actors.options as a read action returning options[]", () => {
    const op = (manifest.operations as Record<string, any>)["actors.options"];
    expect(op).toBeDefined();
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("read");
    expect(op.inputSchema.properties.search).toBeDefined();
  });

  test("includes all expected action operations", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    const expectedOps = [
      "healthcheck",
      "actors.list",
      "actors.get",
      "actor.run",
      "actor.run_sync_get_dataset_items",
      "runs.get",
      "runs.list",
      "runs.abort",
      "datasets.get",
      "datasets.items",
      "tasks.list",
      "task.run",
      "task.run_sync_get_dataset_items",
      "key_value_store.get_record",
    ];
    for (const key of expectedOps) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("action");
    }
  });

  test("actorId fields declare a dynamic-options source", () => {
    const ops = manifest.operations as Record<string, any>;
    for (const key of ["actor.run", "actor.run_sync_get_dataset_items", "runs.list"]) {
      const actorId = ops[key].inputSchema.properties.actorId;
      expect(actorId["x-dynamic-options"]).toMatchObject({
        source: "actors.options", valueField: "id", labelField: "label", searchParam: "search",
      });
    }
  });

  test("actorId dynamic-options declare a detailSource for runInput", () => {
    const ops = manifest.operations as Record<string, any>;
    for (const key of ["actor.run", "actor.run_sync_get_dataset_items", "runs.list"]) {
      expect(ops[key].inputSchema.properties.actorId["x-dynamic-options"].detailSource).toBe("actors.input_schema");
    }
  });
});
