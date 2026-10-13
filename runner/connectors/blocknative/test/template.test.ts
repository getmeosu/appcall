import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("Blocknative operations stay single-route JSON reads with strict defaults", () => {
  const operations = manifest.operations as Record<string, Record<string, unknown>>;
  expect(Object.keys(operations).sort()).toEqual([
    "chains.list",
    "gas.basefee.estimates",
    "gas.distribution.get",
    "gas.prices.get",
    "healthcheck",
    "oracles.list",
  ]);
  for (const [key, operation] of Object.entries(operations)) {
    const request = operation.request as { method?: string; path?: string; body?: unknown };
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
    expect(operation.kind, key).toBe("action");
    expect(operation.sideEffect, key).toBe("read");
    expect(request.method, key).toBe("GET");
    expect(request.body, key).toBeUndefined();
    expect(String(request.path).startsWith("/"), key).toBe(true);
    expect(operation.maxResponseBytes as number, key).toBeGreaterThanOrEqual(operation.maxInputBytes as number);
  }
});
