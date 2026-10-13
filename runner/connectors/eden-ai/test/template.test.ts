import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  responseFormat?: string;
  validationMode?: string;
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; baseUrl?: string };
  inputSchema?: { type?: string };
  outputSchema?: { type?: string };
  maxInputBytes?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  title?: string;
  description?: string;
  enforceOutputSchema?: boolean;
}>;

const postKeys = [
  "anthropic-tokens.count",
  "anthropic-messages.create",
  "chat-completions.create",
  "embeddings.create",
  "responses.create",
  "text.moderate",
  "universal-ai.run",
];

test("Eden AI manifest compiles with strict JSON defaults", () => {
  expect(manifest.key).toBe("eden-ai");
  expect(manifest.network.allowedHosts).toEqual(["api.edenai.run"]);
  expect(manifest.http.baseUrl).toBe("https://api.edenai.run");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.http.headers).toEqual({ Accept: "application/json" });
  expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  expect(Object.keys(operations).sort()).toEqual([
    "anthropic-messages.create",
    "anthropic-tokens.count",
    "chat-completions.create",
    "embeddings.create",
    "responses.create",
    "responses.get",
    "text.moderate",
    "universal-ai.run",
  ]);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.title, key).toBeString();
    expect(operation.description, key).toBeString();
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes ?? 0, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    expect(String(operation.request?.path ?? "").startsWith("/v3/"), key).toBe(true);
    expect(operation.request?.baseUrl, key).toBeUndefined();
    expect(JSON.stringify(operation.request?.body ?? null), key).not.toContain("stream");
    expect(JSON.stringify(operation.request ?? {}), key).not.toContain("http://");
    expect(JSON.stringify(operation.request ?? {}), key).not.toContain("https://");
  }
  expect(operations["responses.get"]?.sideEffect).toBe("read");
  expect(operations["responses.get"]?.request?.method).toBe("GET");
  expect(operations["responses.get"]?.request?.body).toBeUndefined();
  expect(operations["responses.get"]?.request?.headers?.["Content-Type"]).toBeUndefined();
  expect(operations["anthropic-tokens.count"]?.sideEffect).toBe("read");
  for (const key of postKeys) {
    expect(operations[key]?.request?.method, key).toBe("POST");
    expect(operations[key]?.request?.headers?.["Content-Type"], key).toBe("application/json");
    expect(operations[key]?.request?.body, key).toBeObject();
  }
});
