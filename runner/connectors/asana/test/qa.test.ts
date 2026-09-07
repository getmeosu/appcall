import { expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import fixture from "../fixtures/user_me.json";

type Assertion = { path: string; op: string; value?: unknown };
function accepts(output: Record<string, unknown>, assertion: Assertion): boolean {
  const value = output[assertion.path];
  switch (assertion.op) {
    case "eq": return value === assertion.value;
    case "type": return typeof value === assertion.value;
    case "matches": return typeof value === "string" && new RegExp(String(assertion.value)).test(value);
    case "gt": return typeof value === "number" && value > Number(assertion.value);
    default: throw new Error(`Unsupported probe assertion: ${assertion.op}`);
  }
}

it("provides a read-only identity probe whose contract rejects echoes and missing identities", async () => {
  const file = Bun.file(new URL("../qa.json", import.meta.url));
  expect(await file.exists()).toBe(true);
  const qa = await file.json();
  expect(qa.connector).toBe("asana");
  expect(qa.scenarios).toHaveLength(1);
  const scenario = qa.scenarios[0];
  expect(scenario.operation).toBe("healthcheck");
  expect(scenario.input).toEqual({});
  expect(scenario.setup ?? []).toEqual([]);
  expect(scenario.teardown ?? []).toEqual([]);
  expect(manifest.operations.healthcheck.kind).toBe("action");
  expect(manifest.operations.healthcheck.sideEffect).toBe("read");
  expect(scenario.expect.status).toBe("ok");
  const assertions: Assertion[] = scenario.expect.assertions;
  expect(assertions).toContainEqual({ path: "source", op: "eq", value: "provider" });
  expect(assertions.some(a => a.path === "userGid" && a.op === "type")).toBe(true);
  const { actions } = compileDeclarativeConnector(manifest as never);
  let calls = 0;
  const output = await actions.healthcheck!({
    ...{"apiToken": "test-token"},
    fetch: async () => {
      calls += 1;
      return Response.json(fixture);
    },
  }) as Record<string, unknown>;
  expect(calls).toBe(1);
  for (const assertion of assertions) expect(accepts(output, assertion)).toBe(true);
  const { userGid: omitted, ...missingIdentity } = output;
  expect(assertions.every(a => accepts(missingIdentity, a))).toBe(false);
  const echo = actions.healthcheck!({}) as Record<string, unknown>;
  expect(assertions.every(a => accepts(echo, a))).toBe(false);
});
