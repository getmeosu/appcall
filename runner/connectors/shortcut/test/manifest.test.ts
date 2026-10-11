import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("shortcut manifest", () => {
  test("declares identity, token auth, and the v3 host", () => {
    expect(manifest.key).toBe("shortcut");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.app.shortcut.com/api/v3");
    expect(manifest.network.allowedHosts).toEqual(["api.app.shortcut.com"]);
    expect(manifest.http.auth.name).toBe("Shortcut-Token");
    expect(manifest.http.auth.field).toBe("apiKey");
  });

  test("keeps webhook side effects read-only", () => {
    const webhooks = Object.entries(operations).filter(([, operation]) => operation.kind === "webhook");
    expect(webhooks.length).toBe(5);
    for (const [, operation] of webhooks) {
      expect(operation.sideEffect).toBe("read");
      expect(operation.request).toBeUndefined();
    }
  });

  test("every action has a title, description, object inputSchema, and request or handwritten upload", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind !== "action") continue;
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const schema = operation.inputSchema as { type?: string };
      expect(schema.type).toBe("object");
      if (key === "files.upload") {
        expect(operation.request).toBeUndefined();
        continue;
      }
      const request = operation.request as { method?: string; path?: string };
      expect(request.method).toMatch(/^(GET|POST|PUT|DELETE)$/);
      expect(request.path).toMatch(/^\//);
    }
  });
});
