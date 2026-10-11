import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { actions as wrapped } from "../src/actions";
import manifest from "../manifest.json";

type Exchange = {
  request: { method: string; url: string; headers?: Record<string, string>; body: string | null; multipart?: boolean };
  response: { status: number; headers?: Record<string, string>; bodyFile: string };
};
type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Exchange[];
  expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
};

const compiled = compileDeclarativeConnector(manifest as never);
const casesDir = join(import.meta.dir, "../fixtures/cases");

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
  const query = (url: URL) => [...url.searchParams.entries()].sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  return JSON.stringify(query(x)) === JSON.stringify(query(y));
}

function sameForm(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const left = [...new URLSearchParams(a).entries()].sort();
  const right = [...new URLSearchParams(b).entries()].sort();
  return JSON.stringify(left) === JSON.stringify(right);
}

const HANDWRITTEN = new Set([
  "create_conference",
  "update_conference",
  "create_contact",
  "register_participant",
  "send_invitation",
  "upload_file",
  "download_file",
  "get_chat_details",
  "get_session_qa_history",
  "get_session_poll_details",
  "get_session_surveys",
  "get_session_survey_details",
]);

function expectedSuccess(fixture: FixtureCase, responseBody: string): unknown {
  const file = JSON.parse(readFileSync(join(casesDir, fixture.expected.kind === "success" ? fixture.expected.resultFile : ""), "utf8")) as Record<string, unknown>;
  if (HANDWRITTEN.has(fixture.operation)) {
    if ("connector" in file && "data" in file) return { data: file.data };
    return file;
  }
  if ("connector" in file && "action" in file) return file;
  return {
    connector: "clickmeeting",
    action: fixture.operation,
    source: "provider",
    ...file,
  };
}

describe("clickmeeting compiled actions", () => {
  it("compiles one handler per action", () => {
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(wrapped).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("clickmeeting HTTP contract", () => {
  it("sends X-Api-Key and maps 401/429", async () => {
    const seen: Request[] = [];
    await wrapped.healthcheck!({
      apiKey: "secret",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify({ ping: "pong" }), { status: 200 });
      },
    });
    expect(seen[0]!.headers.get("x-api-key")).toBe("secret");
    expect(seen[0]!.url).toBe("https://api.clickmeeting.com/v1/ping");
    await expect(
      wrapped.healthcheck!({ apiKey: "x", fetch: async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      wrapped.healthcheck!({
        apiKey: "x",
        fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "4" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  it("accepts Composio room_id alias for conferences.get", async () => {
    const seen: Request[] = [];
    await wrapped["conferences.get"]!({
      apiKey: "x",
      room_id: 2686,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify({ conference: { id: 2686 } }), { status: 200 });
      },
    });
    expect(new URL(seen[0]!.url).pathname).toBe("/v1/conferences/2686");
  });
});

describe("clickmeeting fixture replay", () => {
  const cases = loadCases();

  it("has a fixture for every action", () => {
    const covered = new Set(cases.map((fixture) => fixture.operation));
    expect(covered).toEqual(new Set(Object.keys(manifest.operations)));
  });

  it("replays every fixture case", async () => {
    for (const fixture of cases) {
      const action = wrapped[fixture.operation];
      expect(action, fixture.id).toBeDefined();
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const expected = fixture.exchanges[index++];
        if (!expected) throw new Error(`${fixture.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${fixture.id}: request mismatch ${method} ${url} vs ${expected.request.method} ${expected.request.url}`);
        }
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expected.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          if (gotHeaders.get(key) !== value) throw new Error(`${fixture.id}: header mismatch ${key}: ${gotHeaders.get(key)} vs ${value}`);
        }
        if (expected.request.multipart || init?.body instanceof FormData) {
          if (!(init?.body instanceof FormData)) throw new Error(`${fixture.id}: expected FormData`);
          expect(init.body.has("uploaded")).toBe(true);
        } else {
          const body = init?.body == null ? null : String(init.body);
          if (expected.request.body && expected.request.headers?.["content-type"]?.includes("x-www-form-urlencoded")) {
            if (!sameForm(body, expected.request.body)) {
              throw new Error(`${fixture.id}: form mismatch ${body} vs ${expected.request.body}`);
            }
          } else if (body !== expected.request.body) {
            throw new Error(`${fixture.id}: body mismatch ${JSON.stringify(body)} vs ${JSON.stringify(expected.request.body)}`);
          }
        }
        const bodyBytes = readFileSync(join(dirname(join(casesDir, `${fixture.id}.json`)), expected.response.bodyFile));
        return new Response(bodyBytes, { status: expected.response.status, headers: expected.response.headers });
      };
      const payload = { ...fixture.input, ...fixture.credentials, fetch: fetchStub };
      if (fixture.expected.kind === "error") {
        try {
          await action!(payload);
          throw new Error(`${fixture.id}: expected ${fixture.expected.code}`);
        } catch (error) {
          expect((error as { code?: string }).code, fixture.id).toBe(fixture.expected.code);
        }
        continue;
      }
      const result = await action!(payload);
      const responseBody = readFileSync(join(casesDir, fixture.exchanges[0]!.response.bodyFile), "utf8");
      expect(result, fixture.id).toEqual(expectedSuccess(fixture, responseBody));
      expect(index, fixture.id).toBe(fixture.exchanges.length);
    }
  });
});
