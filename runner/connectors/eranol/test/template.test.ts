import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = Object.entries(manifest.operations) as [string, Record<string, unknown>][];

test("Eranol manifest is one JSON route per operation on the official host", () => {
  expect(manifest.key).toBe("eranol");
  expect(manifest.network.allowedHosts).toEqual(["eranol.com"]);
  expect(manifest.http.baseUrl).toBe("https://eranol.com/api/v1");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "x-api-key",
    value: "{{apiKey}}",
  });
  expect(operations.map(([key]) => key).sort()).toEqual([
    "audio.enhance",
    "jobs.delete",
    "jobs.result",
    "jobs.status",
    "videos.caption",
    "videos.concat",
    "videos.trim",
    "videos.watermark",
  ]);
  for (const [key, operation] of operations) {
    const request = operation.request as {
      method?: string;
      path?: string;
      body?: unknown;
      headers?: Record<string, string>;
      baseUrl?: string;
    };
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
    expect(operation.maxResponseBytes as number, key).toBeGreaterThanOrEqual(operation.maxInputBytes as number);
    expect(operation.timeoutMs as number, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs as number, key).toBeLessThanOrEqual(300000);
    expect((operation.maxInputBytes as number) <= 26214400, key).toBe(true);
    expect(typeof operation.title, key).toBe("string");
    expect(typeof operation.description, key).toBe("string");
    expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
    expect(request.baseUrl, key).toBeUndefined();
    expect(request.method, key).toMatch(/^(GET|POST|DELETE)$/);
    expect(request.path?.startsWith("/"), key).toBe(true);
    expect(request.path?.includes("http"), key).toBe(false);
    if (request.method === "GET" || request.method === "DELETE") {
      expect(request.body, key).toBeUndefined();
      expect(request.headers?.["Content-Type"], key).toBeUndefined();
    } else {
      expect(request.body, key).toBeDefined();
      expect(request.headers?.["Content-Type"], key).toBe("application/json");
    }
  }
});
