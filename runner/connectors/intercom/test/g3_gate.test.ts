import { describe, expect, test } from "bun:test";
import { defaultConnectorRegistry } from "../../../bun/src/registry";

type Call = { method: string; path: string; body: string | null };

function stubFetch(status = 200, body: unknown = { type: "object", id: "1" }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push({
      method: init?.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

async function run(action: string, input: Record<string, unknown>, status = 200, body?: unknown) {
  const { calls, impl } = stubFetch(status, body);
  const result = defaultConnectorRegistry.executeAction("intercom", action, { ...input, accessToken: "token", fetch: impl });
  if (!result.ok) return { calls, failure: result as unknown as Record<string, unknown> };
  try {
    return { calls, output: (await Promise.resolve(result.output)) as Record<string, unknown> };
  } catch (error) {
    return { calls, error: error as Record<string, unknown> };
  }
}

function headerFetch(status: number, body: string) {
  const seen: { path: string; method: string; version: string | null; body: string | null }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    seen.push({
      path: `${url.pathname}${url.search}`,
      method: init?.method ?? "GET",
      version: new Headers(init?.headers).get("Intercom-Version"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(body, { status, headers: body ? { "content-type": "application/json" } : {} });
  }) as unknown as typeof fetch;
  return { seen, impl };
}

describe("Intercom G3 gate-closing ops", () => {
  const cases: [string, Record<string, unknown>, Call][] = [
    ["contacts.block", { id: "6512" }, { method: "POST", path: "/contacts/6512/block", body: null }],
    [
      "contacts.get_by_external_id",
      { externalId: "ext-42" },
      { method: "GET", path: "/contacts/find_by_external_id/ext-42", body: null },
    ],
    ["companies.list_notes", { id: "531" }, { method: "GET", path: "/companies/531/notes", body: null }],
    ["companies.scroll", {}, { method: "GET", path: "/companies/scroll", body: null }],
    ["companies.scroll", { scrollParam: "abc-1" }, { method: "GET", path: "/companies/scroll?scroll_param=abc-1", body: null }],
  ];

  for (const [action, input, call] of cases) {
    test(`${action} ${JSON.stringify(input)} makes exactly one call and returns provider JSON`, async () => {
      const settled = await run(action, input, 200, { type: "object", id: "r1" });
      expect(settled.failure).toBeUndefined();
      expect(settled.error).toBeUndefined();
      expect(settled.calls).toEqual([call]);
      expect(settled.output).toMatchObject({ connector: "intercom", action, data: { id: "r1" } });
    });
  }

  test("companies.list_notes alone sends Intercom-Version 2.15; siblings keep 2.13", async () => {
    for (const [action, input, version] of [
      ["companies.list_notes", { id: "531" }, "2.15"],
      ["companies.get", { id: "531" }, "2.13"],
      ["notes.list", { id: "6512" }, "2.13"],
      ["companies.scroll", {}, "2.13"],
    ] as [string, Record<string, unknown>, string][]) {
      const { seen, impl } = headerFetch(200, '{"type":"list","data":[]}');
      const result = defaultConnectorRegistry.executeAction("intercom", action, { ...input, accessToken: "token", fetch: impl });
      expect(result.ok).toBe(true);
      if (result.ok) await Promise.resolve(result.output);
      expect(seen.map((s) => s.version)).toEqual([version]);
    }
  });

  test("tags.delete tolerates Intercom's empty 200 body with a fixed envelope", async () => {
    const { seen, impl } = headerFetch(200, "");
    const result = defaultConnectorRegistry.executeAction("intercom", "tags.delete", { id: "17", accessToken: "token", fetch: impl });
    expect(result.ok).toBe(true);
    const output = result.ok ? await Promise.resolve(result.output) : undefined;
    expect(seen).toEqual([{ path: "/tags/17", method: "DELETE", version: "2.13", body: null }]);
    expect(output).toMatchObject({ connector: "intercom", action: "tags.delete", data: { type: "tag", id: "17", deleted: true } });
  });

  test("tags.delete 400 tag_has_dependent_objects surfaces CONNECTOR_UPSTREAM_ERROR", async () => {
    const settled = await run("tags.delete", { id: "18" }, 400, {
      type: "error.list",
      errors: [{ code: "tag_has_dependent_objects", message: "Unable to delete Tag with dependent objects." }],
    });
    expect(settled.error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(settled.calls).toHaveLength(1);
  });

  test("contacts.block 404 surfaces CONNECTOR_UPSTREAM_ERROR", async () => {
    const settled = await run("contacts.block", { id: "missing" }, 404, {
      type: "error.list",
      errors: [{ code: "not_found", message: "User Not Found" }],
    });
    expect(settled.error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  for (const [action, input] of [
    ["contacts.get_by_external_id", { id: "6512" }],
    ["contacts.get_by_external_id", {}],
    ["companies.scroll", { scrollParam: "" }],
    ["companies.list_notes", { id: "531", perPage: 10 }],
    ["tags.delete", {}],
  ] as [string, Record<string, unknown>][]) {
    test(`${action} rejects ${JSON.stringify(input)} before any fetch`, async () => {
      const settled = await run(action, input);
      expect(settled.calls).toHaveLength(0);
      const code = (settled.failure?.error as { code?: string } | undefined)?.code ?? settled.error?.code;
      expect(code).toBe("INVALID_ACTION_INPUT");
    });
  }
});
