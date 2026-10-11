import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

type Exchange = {
  request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
  response: { status: number; headers?: Record<string, string>; bodyFile: string | null };
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
const fixturesRoot = join(import.meta.dir, "../fixtures");
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

describe("listennotes compiled actions", () => {
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

  it("sends X-ListenAPI-Key on healthcheck and omits empty genre query", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ languages: ["English"] });
    };
    await actions.healthcheck!({ apiKey: "secret", fetch });
    await actions["genres.list"]!({ apiKey: "secret", fetch });
    expect(seen[0]!.headers.get("x-listenapi-key")).toBe("secret");
    expect(seen[0]!.url).toBe("https://listen-api.listennotes.com/api/v2/languages");
    expect(seen[1]!.url).toBe("https://listen-api.listennotes.com/api/v2/genres");
  });

  it("rejects missing podcast id before fetch and maps 401/429", async () => {
    let called = false;
    await expect(
      actions["podcasts.get"]!({
        apiKey: "x",
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

  it("posts form-encoded episode ids to /episodes", async () => {
    let req: Request | undefined;
    const created = await actions["episodes.batch"]!({
      apiKey: "token",
      ids: "abc,def",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        req = new Request(input, init);
        return response({ episodes: [{ id: "abc" }] });
      },
    });
    expect(req!.method).toBe("POST");
    expect(req!.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await req!.clone().text()).toBe("ids=abc%2Cdef");
    expect(created).toMatchObject({ data: { episodes: [{ id: "abc" }] } });
  });
});

describe("listennotes fixture replay", () => {
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
        const url = String(input instanceof Request ? input.url : input);
        const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${fixture.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expected.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          expect(gotHeaders.get(key), `${fixture.id} header ${key}`).toBe(value);
        }
        for (const [key] of gotHeaders) {
          if (key === "content-length") continue;
          expect(expectedHeaders.has(key), `${fixture.id} unexpected header ${key}`).toBe(true);
        }
        const body = init?.body == null ? null : String(init.body);
        expect(body, fixture.id).toBe(expected.request.body);
        const bodyFile = expected.response.bodyFile ? join(casesDir, expected.response.bodyFile) : null;
        const payload = bodyFile && expected.response.status !== 204 ? readFileSync(bodyFile) : null;
        return new Response(expected.response.status === 204 ? null : payload, {
          status: expected.response.status,
          headers: expected.response.headers,
        });
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

void fixturesRoot;
