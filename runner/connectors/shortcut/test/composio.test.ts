import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/cases.json";

const { actions } = compileDeclarativeConnector(manifest as never);

const response = (body: unknown, status = 200) =>
  new Response(body === null || body === undefined ? null : JSON.stringify(body), { status });

describe("shortcut Composio HTTP operations", () => {
  test("covers every Composio tool as a real action", () => {
    const ops = manifest.operations as Record<string, { kind?: string; request?: unknown }>;
    const actionKeys = Object.entries(ops)
      .filter(([, operation]) => operation.kind === "action")
      .map(([key]) => key);
    expect(actionKeys.length).toBeGreaterThanOrEqual(142);
    for (const [key, operation] of Object.entries(ops)) {
      if (operation.kind !== "action") continue;
      expect(Boolean(operation.request) || key === "files.upload").toBe(true);
    }
  });

  for (const fixture of cases as Array<{
    key: string;
    method: string;
    path: string;
    input: Record<string, unknown>;
    status: number;
    body: unknown;
  }>) {
    test(`${fixture.key} ${fixture.method} ${fixture.path}`, async () => {
      const handler = actions[fixture.key];
      expect(handler).toBeDefined();
      const seen: Request[] = [];
      const out = await handler!({
        apiKey: "secret",
        ...fixture.input,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          return response(fixture.body, fixture.status);
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]!.method).toBe(fixture.method);
      const url = new URL(seen[0]!.url);
      expect(url.pathname).toBe(`/api/v3${fixture.path}`);
      expect(seen[0]!.headers.get("shortcut-token")).toBe("secret");
      expect(out).toMatchObject({ connector: "shortcut", action: fixture.key, source: "provider" });
    });
  }
});
