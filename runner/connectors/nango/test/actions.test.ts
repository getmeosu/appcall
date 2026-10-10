import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

type Exchange = {
  request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
  response: { status: number; bodyFile: string | null };
};
type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Exchange[];
  expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
};

const { actions } = compileDeclarativeConnector(manifest as never);
const casesDir = join(import.meta.dir, "../fixtures/cases");
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(body === null || body === "" ? null : JSON.stringify(body), { status, headers });

function loadCases(): FixtureCase[] {
  return readdirSync(casesDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(casesDir, name), "utf8")) as FixtureCase);
}

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) =>
    [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

describe("nango compiled actions", () => {
  it("compiles one handler per action", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it("keeps provenance and evidence", () => {
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
  });

  it("sends bearer auth on healthcheck and omits empty connection-list query", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ data: [] });
    };
    await actions.healthcheck!({ apiKey: "secret", fetch });
    await actions["connections.list"]!({ apiKey: "secret", fetch });
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0]!.url).toBe("https://api.nango.dev/providers");
    expect(seen[1]!.url).toBe("https://api.nango.dev/connections");
  });

  it("encodes tags as deepObject query params", async () => {
    let req: Request | undefined;
    await actions["connections.list"]!({
      apiKey: "secret",
      tags: { end_user_id: "user-1" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        req = new Request(input, init);
        return response({ connections: [] });
      },
    });
    expect(sameUrl(req!.url, "https://api.nango.dev/connections?tags[end_user_id]=user-1")).toBe(true);
  });

  it("rejects missing connection_id before fetch and maps 401/429", async () => {
    let called = false;
    await expect(
      actions["connections.get"]!({
        apiKey: "x",
        provider_config_key: "github",
        fetch: async () => {
          called = true;
          return response({});
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
    await expect(actions.healthcheck!({ apiKey: "x", fetch: async () => response({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      actions.healthcheck!({ apiKey: "x", fetch: async () => response({}, 429, { "retry-after": "4" }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  it("posts JSON to /action/trigger with connection headers", async () => {
    let req: Request | undefined;
    const created = await actions["actions.trigger"]!({
      apiKey: "token",
      action_name: "create-issue",
      connection_id: "conn-1",
      provider_config_key: "github-prod",
      input: { title: "Bug" },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        req = new Request(input, init);
        return response({ id: 42 });
      },
    });
    expect(req!.method).toBe("POST");
    expect(req!.headers.get("content-type")).toBe("application/json");
    expect(req!.headers.get("connection-id")).toBe("conn-1");
    expect(req!.headers.get("provider-config-key")).toBe("github-prod");
    expect(await req!.clone().json()).toEqual({ action_name: "create-issue", input: { title: "Bug" } });
    expect(created).toMatchObject({ data: { id: 42 } });
  });
});

describe("nango fixture replay", () => {
  const cases = loadCases();

  it("has a success fixture for every action", () => {
    const covered = new Set(
      cases.filter((fixture) => fixture.expected.kind === "success").map((fixture) => fixture.operation),
    );
    expect([...covered].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it("replays every fixture case", async () => {
    for (const fixture of cases) {
      const action = actions[fixture.operation];
      expect(action, fixture.id).toBeDefined();
      if (fixture.expected.kind === "error" && fixture.exchanges.length === 0) {
        let called = false;
        await expect(
          action!({
            ...fixture.input,
            ...fixture.credentials,
            fetch: async () => {
              called = true;
              return new Response("{}", { status: 200 });
            },
          }),
        ).rejects.toMatchObject({ code: fixture.expected.code });
        expect(called, fixture.id).toBe(false);
        continue;
      }
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const expected = fixture.exchanges[index++];
        if (!expected) throw new Error(`${fixture.id}: unexpected extra request`);
        const url = String(new Request(input, init).url);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${fixture.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const gotAuth = new Headers(init?.headers).get("authorization");
        expect(gotAuth, fixture.id).toBe(expected.request.headers?.authorization ?? "Bearer token");
        if (expected.request.body != null) {
          expect(JSON.parse(String(init?.body ?? "")), fixture.id).toEqual(JSON.parse(expected.request.body));
        }
        const bodyFile = expected.response.bodyFile ? join(casesDir, expected.response.bodyFile) : null;
        const body = bodyFile && expected.response.status !== 204 ? readFileSync(bodyFile) : null;
        return new Response(expected.response.status === 204 ? null : body, { status: expected.response.status });
      };
      if (fixture.expected.kind === "error") {
        await expect(action!({ ...fixture.input, ...fixture.credentials, fetch: fetchStub })).rejects.toMatchObject({
          code: fixture.expected.code,
        });
        expect(index, fixture.id).toBe(fixture.exchanges.length);
        continue;
      }
      const result = await action!({ ...fixture.input, ...fixture.credentials, fetch: fetchStub });
      const expected = JSON.parse(readFileSync(join(casesDir, fixture.expected.resultFile), "utf8"));
      expect(result, fixture.id).toEqual(expected);
      expect(index, fixture.id).toBe(fixture.exchanges.length);
    }
  });
});
