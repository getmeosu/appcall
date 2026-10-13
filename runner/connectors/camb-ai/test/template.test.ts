import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("CAMB.AI operations stay single-route JSON with strict defaults", () => {
  const operations = manifest.operations as Record<string, Record<string, unknown>>;
  expect(Object.keys(operations).sort()).toEqual([
    "dub.create",
    "subtitles.create",
    "text.translate",
    "voices.list",
  ]);
  for (const [key, operation] of Object.entries(operations)) {
    const request = operation.request as {
      method?: string;
      path?: string;
      body?: unknown;
      headers?: Record<string, string>;
      success?: number[];
    };
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
    expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
    expect(operation.kind, key).toBe("action");
    expect(["read", "write"]).toContain(operation.sideEffect);
    expect(["GET", "POST"]).toContain(request.method);
    expect(String(request.path).startsWith("/"), key).toBe(true);
    expect(String(request.path).includes("{{"), key).toBe(false);
    expect(request.success, key).toEqual([200]);
    expect(operation.maxResponseBytes as number, key).toBeGreaterThanOrEqual(operation.maxInputBytes as number);
    expect(operation.maxInputBytes as number, key).toBeLessThanOrEqual(26214400);
    expect(operation.timeoutMs as number, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs as number, key).toBeLessThanOrEqual(300000);
    if (request.method === "GET") {
      expect(request.body, key).toBeUndefined();
      expect(request.headers?.["Content-Type"], key).toBeUndefined();
    } else {
      expect(request.body, key).toBeDefined();
      expect(request.headers?.["Content-Type"], key).toBe("application/json");
    }
  }
  expect(operations["voices.list"].sideEffect).toBe("read");
  expect(operations["text.translate"].sideEffect).toBe("write");
  expect(operations["subtitles.create"].sideEffect).toBe("write");
  expect(operations["dub.create"].sideEffect).toBe("write");
});
