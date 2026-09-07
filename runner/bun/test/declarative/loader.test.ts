import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDeclarativeManifests, withDeclarativeConnectors } from "../../src/declarative/loader";

let root = "";

const declarative = {
  key: "demo-declarative",
  name: "Demo Declarative",
  version: "0.1.0",
  runtime: "bun",
  auth: { type: "api_key", scopes: [] },
  network: { allowedHosts: ["api.demo.test"] },
  http: { baseUrl: "https://api.demo.test", auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" } },
  operations: {
    "things.get": {
      kind: "action",
      timeoutMs: 10000,
      maxInputBytes: 4096,
      maxResponseBytes: 65536,
      title: "Get Thing",
      description: "Fetch a thing.",
      inputSchema: { type: "object", properties: { thingId: { type: "string" } }, required: ["thingId"] },
      request: { method: "GET", path: "/things/{{thingId}}" },
    },
  },
  models: ["thing"],
};

const handwritten = {
  key: "demo-handwritten",
  name: "Demo Handwritten",
  operations: { "things.send": { kind: "action", timeoutMs: 1000, maxInputBytes: 10, maxResponseBytes: 10 } },
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "appcall-declarative-"));
  mkdirSync(join(root, "demo-declarative"));
  writeFileSync(join(root, "demo-declarative", "manifest.json"), JSON.stringify(declarative));
  mkdirSync(join(root, "demo-handwritten"));
  writeFileSync(join(root, "demo-handwritten", "manifest.json"), JSON.stringify(handwritten));
  mkdirSync(join(root, "not-a-connector"));
  writeFileSync(join(root, "not-a-connector", "README.md"), "no manifest here");
  writeFileSync(join(root, "qa.schema.json"), "{}");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("loadDeclarativeManifests", () => {
  it("returns only manifests that declare at least one request block", () => {
    const loaded = loadDeclarativeManifests(root);
    expect(loaded.map((manifest) => manifest.key)).toEqual(["demo-declarative"]);
  });

  it("ignores directories without a manifest and stray files at the root", () => {
    expect(() => loadDeclarativeManifests(root)).not.toThrow();
  });

  it("returns an empty list for a missing root", () => {
    expect(loadDeclarativeManifests(join(root, "nope"))).toEqual([]);
  });

  it("throws a located error for a malformed manifest", () => {
    const broken = mkdtempSync(join(tmpdir(), "appcall-declarative-broken-"));
    mkdirSync(join(broken, "bad"));
    writeFileSync(join(broken, "bad", "manifest.json"), "{ not json");
    expect(() => loadDeclarativeManifests(broken)).toThrow(/bad\/manifest\.json/);
    rmSync(broken, { recursive: true, force: true });
  });
});

describe("withDeclarativeConnectors", () => {
  it("adds discovered declarative manifests and their compiled handlers", () => {
    const augmented = withDeclarativeConnectors(
      { manifests: [handwritten], healthchecks: {}, actions: { "demo-handwritten": { "things.send": () => ({}) } } },
      root,
    );
    expect(augmented.manifests.map((manifest) => (manifest as { key: string }).key).sort())
      .toEqual(["demo-declarative", "demo-handwritten"]);
    expect(typeof augmented.actions["demo-declarative"]?.["things.get"]).toBe("function");
  });

  it("keeps a hand-written handler when the same operation is also declarative", () => {
    const handwrittenHandler = () => ({ from: "handwritten" });
    const augmented = withDeclarativeConnectors(
      {
        manifests: [declarative],
        healthchecks: {},
        actions: { "demo-declarative": { "things.get": handwrittenHandler } },
      },
      root,
    );
    expect(augmented.actions["demo-declarative"]?.["things.get"]).toBe(handwrittenHandler);
  });

  it("compiles declarative operations declared on a statically registered manifest", () => {
    const augmented = withDeclarativeConnectors(
      { manifests: [declarative], healthchecks: {}, actions: {} },
      join(root, "nope"),
    );
    expect(typeof augmented.actions["demo-declarative"]?.["things.get"]).toBe("function");
  });

  it("does not duplicate a manifest already registered statically", () => {
    const augmented = withDeclarativeConnectors(
      { manifests: [declarative], healthchecks: {}, actions: {} },
      root,
    );
    expect(augmented.manifests.filter((manifest) => (manifest as { key: string }).key === "demo-declarative")).toHaveLength(1);
  });

  it("leaves the caller's input object untouched", () => {
    const input = { manifests: [handwritten], healthchecks: {}, actions: {} };
    withDeclarativeConnectors(input, root);
    expect(input.manifests).toHaveLength(1);
    expect(Object.keys(input.actions)).toHaveLength(0);
  });
});

describe("withDeclarativeConnectors healthchecks", () => {
  const withHealthcheck = {
    key: "demo-health",
    name: "Demo Health",
    network: { allowedHosts: ["api.demo.test"] },
    http: { baseUrl: "https://api.demo.test", auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" } },
    operations: {
      healthcheck: {
        kind: "action",
        timeoutMs: 5000,
        maxInputBytes: 4096,
        maxResponseBytes: 65536,
        inputSchema: { type: "object", properties: {} },
        request: { method: "GET", path: "/whoami", echo: { status: "ok" }, result: { status: "ok" } },
      },
    },
  };

  it("registers a declarative healthcheck operation as the connector healthcheck", () => {
    const augmented = withDeclarativeConnectors(
      { manifests: [withHealthcheck], healthchecks: {}, actions: {} },
      join(root, "nope"),
    );
    const handler = augmented.healthchecks["demo-health"];
    expect(typeof handler).toBe("function");
    expect(handler!()).toEqual({ connector: "demo-health", action: "healthcheck", source: "connector", status: "ok" });
  });

  it("keeps a registered hand-written healthcheck", () => {
    const handwrittenHealthcheck = () => ({ connector: "demo-health", status: "ok", source: "connector" });
    const augmented = withDeclarativeConnectors(
      { manifests: [withHealthcheck], healthchecks: { "demo-health": handwrittenHealthcheck }, actions: {} },
      join(root, "nope"),
    );
    expect(augmented.healthchecks["demo-health"]).toBe(handwrittenHealthcheck);
  });
});
