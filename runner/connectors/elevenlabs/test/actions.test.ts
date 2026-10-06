import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("elevenlabs composio parity", () => {
  test("implements the 155 composio tools", () => {
    const operations = manifest.operations as Record<string, { kind?: string; sideEffect?: string; request?: { method?: string; path?: string } }>;
    expect(Object.keys(operations)).toHaveLength(155);
    expect(manifest.version).toBe("0.4.0");
    expect(operations.healthcheck.request).toMatchObject({ method: "GET", path: "/v1/user" });
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.request?.method, key).toBeTruthy();
      expect(operation.request?.path, key).toBeTruthy();
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
    }
  });
});
