import { describe, expect, test } from "bun:test";
import catalog from "../src/catalog.json";
import mapping from "../fixtures/composio_tool_mapping.json";
import manifest from "../manifest.json";
import { BASELINKER_ACTION_KEYS, baselinkerActions } from "../src/actions";

const tools = catalog as Array<{ tool: string; operation: string; method: string; title: string }>;
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("baselinker manifest", () => {
  test("keeps origin identity and bumps version for Composio depth", () => {
    expect(manifest.key).toBe("baselinker");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.baselinker.com");
    expect(manifest.http.auth.name).toBe("X-BLToken");
    expect(manifest.network.allowedHosts).toContain("api.baselinker.com");
  });

  test("maps every Composio tool to a unique real operation", () => {
    expect(tools).toHaveLength(106);
    const ops = tools.map((tool) => tool.operation);
    expect(new Set(ops).size).toBe(ops.length);
    for (const tool of tools) {
      const operation = operations[tool.operation];
      expect(operation).toBeDefined();
      expect(operation.kind).toBe("action");
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      expect(operation.inputSchema).toMatchObject({ type: "object" });
      expect(operation.request).toMatchObject({
        method: "POST",
        path: "/connector.php",
        bodyEncoding: "form",
        body: { method: tool.method },
      });
      expect(typeof baselinkerActions[tool.operation]).toBe("function");
    }
  });

  test("preserves origin list operations and healthcheck", () => {
    for (const key of ["healthcheck", "inventories.list", "orders.list", "statuses.list", "warehouses.list"]) {
      expect(operations[key]).toBeDefined();
      expect(operations[key].kind).toBe("action");
      expect(operations[key].sideEffect).toBe("read");
      expect(operations[key].request).toBeDefined();
    }
  });

  test("registers a handwritten handler for every action", () => {
    const actionKeys = Object.keys(operations).filter((key) => operations[key].kind === "action");
    expect(BASELINKER_ACTION_KEYS.sort()).toEqual(actionKeys.sort());
    expect(actionKeys).toHaveLength(107);
  });

  test("webhooks stay read-only and none were added", () => {
    const webhooks = Object.values(operations).filter((operation) => operation.kind === "webhook");
    expect(webhooks).toEqual([]);
  });

  test("runner operations equal catalog tools plus healthcheck", () => {
    const expected = ["healthcheck", ...tools.map((tool) => tool.operation)].sort();
    expect(Object.keys(operations).sort()).toEqual(expected);
    expect(mapping.map((row: { operation: string }) => row.operation).sort()).toEqual(
      tools.map((tool) => tool.operation).sort(),
    );
  });

  test("descriptions are real Composio tool text, not slug headings", () => {
    for (const tool of tools) {
      expect(String(operations[tool.operation].description)).not.toMatch(/^\*\*Slug:\*\*/);
    }
  });
});
