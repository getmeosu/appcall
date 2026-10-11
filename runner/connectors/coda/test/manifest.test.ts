import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import routes from "./deepened-routes.json";

const operations = manifest.operations as Record<string, any>;
const EXISTING = ["healthcheck", "docs.list", "docs.get", "pages.list", "tables.list", "columns.list", "rows.list"];

describe("coda declarative connector", () => {
  test("declares bearer API key, bounded Coda host, and version 0.2.0", () => {
    expect(manifest.key).toBe("coda");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields[0].key).toBe("apiKey");
    expect(manifest.network.allowedHosts).toEqual(["coda.io"]);
    expect(manifest.http.baseUrl).toBe("https://coda.io/apis/v1");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
  });

  test("keeps the origin/main read surface and adds one real HTTP tool per remaining Composio slug", () => {
    for (const key of EXISTING) expect(operations[key]).toBeDefined();
    expect(Object.keys(operations)).toHaveLength(110);
    expect(routes).toHaveLength(103);
  });

  test("every operation is a real action with title, description, object inputSchema, and request", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(typeof operation.title).toBe("string");
      expect(operation.title.length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(operation.description.length).toBeGreaterThan(0);
      expect(operation.inputSchema?.type).toBe("object");
      expect(operation.request?.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      expect(typeof operation.request?.path).toBe("string");
      expect(operation.request.path.length).toBeGreaterThan(0);
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });

  test("origin/main operations remain read-only with their original paths", () => {
    expect(operations.healthcheck.sideEffect).toBe("read");
    expect(operations.healthcheck.request.path).toBe("/whoami");
    expect(operations["docs.list"].request.path).toBe("/docs");
    expect(operations["docs.get"].request.path).toBe("/docs/{{docId}}");
    expect(operations["pages.list"].request.path).toBe("/docs/{{docId}}/pages");
    expect(operations["tables.list"].request.path).toBe("/docs/{{docId}}/tables");
    expect(operations["columns.list"].request.path).toBe("/docs/{{docId}}/tables/{{tableIdOrName}}/columns");
    expect(operations["rows.list"].request.path).toBe("/docs/{{docId}}/tables/{{tableIdOrName}}/rows");
  });

  test("publishes provenance and bounded execution metadata", () => {
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(manifest.evidence.live.status).toBe("unverified");
    expect(operations.healthcheck.timeoutMs).toBe(5000);
    expect(operations["rows.list"].maxResponseBytes).toBe(5242880);
    expect(operations["docs.list"].description).toContain("nextPageLink");
  });
});
