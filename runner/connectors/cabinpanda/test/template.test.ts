import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("cabinpanda operations keep strict JSON defaults on one route each", () => {
  expect(Object.keys(manifest.operations)).toEqual(["profile.get"]);
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.request?.method, key).toBe("GET");
    expect(operation.request?.path, key).toBe("/profile");
    expect(operation.request?.body, key).toBeUndefined();
  }
});
