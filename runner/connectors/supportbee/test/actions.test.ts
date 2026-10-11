import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import calls from "./calls.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type CallSpec = {
  op: string;
  input: Record<string, unknown>;
  method: string;
  path: string;
  status: number;
  query?: Record<string, string>;
  body?: unknown;
};

const specs = calls as CallSpec[];
const creds = { apiKey: "fixturekey", company: "acme" };

const mock = (body: unknown, status = 200) => {
  const recorded: Request[] = [];
  const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
    recorded.push(new Request(u, i));
    if (status === 204) return new Response("", { status });
    return new Response(JSON.stringify(body ?? { ok: true }), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { recorded, fetch };
};

describe("supportbee compiled actions", () => {
  test("compiles every declared action", () => {
    const declared = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
      .map(([key]) => key)
      .sort();
    expect(Object.keys(actions).sort()).toEqual(declared);
    expect(declared).toHaveLength(42);
  });

  test("issues the official HTTP call for every action", async () => {
    expect(specs.map((s) => s.op).sort()).toEqual(Object.keys(actions).sort());
    for (const spec of specs) {
      const m = mock({ ok: true }, spec.status);
      const result = await actions[spec.op]!({ ...creds, ...spec.input, fetch: m.fetch });
      expect(m.recorded.length, spec.op).toBe(1);
      const req = m.recorded[0];
      expect(req.method, spec.op).toBe(spec.method);
      const url = new URL(req.url);
      expect(url.origin, spec.op).toBe("https://acme.supportbee.com");
      expect(url.pathname, spec.op).toBe(spec.path);
      expect(req.headers.get("authorization"), spec.op).toBe("Bearer fixturekey");
      expect(req.headers.get("accept"), spec.op).toBe("application/json");
      if (spec.query) {
        for (const [key, value] of Object.entries(spec.query)) {
          expect(url.searchParams.get(key), `${spec.op} query ${key}`).toBe(value);
        }
      }
      if (spec.body) {
        expect(req.headers.get("content-type"), spec.op).toContain("application/json");
        expect(await req.json(), spec.op).toEqual(spec.body);
      } else {
        const text = await req.text();
        expect(text === "" || text === undefined, spec.op).toBe(true);
      }
      expect(result.connector, spec.op).toBe("supportbee");
      expect(result.action, spec.op).toBe(spec.op);
      expect(result.source, spec.op).toBe("provider");
      if (spec.status === 204) {
        expect(result.data, spec.op).toEqual({ ok: true });
      }
    }
  });

  test("rejects invalid input, extra fields, and slash company hosts", async () => {
    await expect(actions["tickets.get"]!({ ...creds, fetch: mock({}).fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions.healthcheck!({ ...creds, nope: true, fetch: mock({}).fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["tickets.list"]!({ ...creds, per_page: 100, fetch: mock({}).fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(
      actions.healthcheck!({ apiKey: "fixturekey", company: "a/b", fetch: mock({}).fetch }),
    ).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });

  test("maps 403 and 429 through the shared error contract", async () => {
    await expect(
      actions.healthcheck!({
        ...creds,
        fetch: async () => new Response(JSON.stringify({ message: "Access Denied" }), { status: 403 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions.healthcheck!({
        ...creds,
        fetch: async () =>
          new Response(JSON.stringify({ message: "slow down" }), { status: 429, headers: { "retry-after": "9" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });

  test("drops omitted create-ticket fields from the JSON body", async () => {
    const m = mock({ ticket: { id: 42 } }, 201);
    await actions["tickets.create"]!({
      ...creds,
      subject: "Hi",
      requester_email: "ada@example.com",
      fetch: m.fetch,
    });
    expect(await m.recorded[0].json()).toEqual({
      ticket: { subject: "Hi", requester_email: "ada@example.com", content: {} },
    });
  });
});
