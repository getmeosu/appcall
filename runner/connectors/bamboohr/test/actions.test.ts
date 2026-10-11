import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { actions as wrapped } from "../src/actions";
import manifest from "../manifest.json";

type Exchange = {
  request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
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

const { actions } = compileDeclarativeConnector(manifest as never);
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
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

describe("bamboohr compiled actions", () => {
  it("compiles one handler per action", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("bamboohr fixture replay", () => {
  const cases = loadCases();
  it("has a fixture for every action", () => {
    expect(new Set(cases.map((fixture) => fixture.operation))).toEqual(new Set(Object.keys(manifest.operations)));
  });

  it("replays every fixture case", async () => {
    for (const fixture of cases) {
      const action = actions[fixture.operation];
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
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) {
          throw new Error(`${fixture.id}: body mismatch ${body} vs ${expected.request.body}`);
        }
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expected.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          if (gotHeaders.get(key) !== value) throw new Error(`${fixture.id}: header mismatch ${key}: ${gotHeaders.get(key)} vs ${value}`);
        }
        for (const [key] of gotHeaders) {
          if (!expectedHeaders.has(key) && key !== "content-length") {
            throw new Error(`${fixture.id}: unexpected header ${key}`);
          }
        }
        const bodyBytes = expected.response.bodyFile
          ? readFileSync(join(dirname(join(casesDir, `${fixture.id}.json`)), expected.response.bodyFile))
          : Buffer.from("");
        return new Response(expected.response.status === 204 || bodyBytes.length === 0 ? null : bodyBytes, {
          status: expected.response.status,
          headers: expected.response.headers,
        });
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
      const expected = JSON.parse(readFileSync(join(casesDir, fixture.expected.resultFile), "utf8"));
      expect(result, fixture.id).toEqual(expected);
      expect(index, fixture.id).toBe(fixture.exchanges.length);
    }
  });
});

describe("bamboohr handwritten and aliases", () => {
  const response = (body: unknown, status = 200, headers?: HeadersInit) =>
    new Response(body === null || body === "" ? null : typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers,
    });

  it("accepts employee_id alias for employees.get", async () => {
    const seen: Request[] = [];
    const result = await wrapped["employees.get"]!({
      apiKey: "fixturekey",
      companyDomain: "acme",
      employee_id: "123",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: "123" });
      },
    });
    expect(seen[0]!.url).toBe("https://acme.bamboohr.com/api/v1/employees/123");
    expect(result).toMatchObject({ action: "employees.get", data: { id: "123" } });
  });

  it("routes benefit.get_coverages with coverageId to the item path", async () => {
    const seen: Request[] = [];
    await wrapped["benefit.get_coverages"]!({
      apiKey: "fixturekey",
      companyDomain: "acme",
      coverage_id: "9",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: "9", name: "Family" });
      },
    });
    expect(seen[0]!.url).toBe("https://acme.bamboohr.com/api/v1/benefitcoverages/9");
  });

  it("routes reports.custom with reportId to GET /reports/{id}", async () => {
    const seen: Request[] = [];
    await wrapped["reports.custom"]!({
      apiKey: "fixturekey",
      companyDomain: "acme",
      reportId: "42",
      format: "JSON",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: "42" });
      },
    });
    expect(seen[0]!.method).toBe("GET");
    expect(new URL(seen[0]!.url).pathname).toBe("/api/v1/reports/42");
  });

  it("sends multipart when files.upload includes rawContent", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    await wrapped["files.upload"]!({
      apiKey: "fixturekey",
      companyDomain: "acme",
      category: "1",
      fileName: "handbook.pdf",
      share: "yes",
      rawContent: "hello",
      rawMimetype: "text/plain",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ url: String(input), init });
        return new Response(null, { status: 201, headers: { location: "/api/v1/files/88" } });
      },
    });
    expect(seen[0]!.url).toBe("https://acme.bamboohr.com/api/v1/files");
    expect(seen[0]!.init?.body).toBeInstanceOf(FormData);
  });

  it("base64-encodes non-JSON employee photos", async () => {
    const result = await wrapped["employees.photo"]!({
      apiKey: "fixturekey",
      companyDomain: "acme",
      employeeId: "123",
      size: "small",
      fetch: async () => new Response("JPEGDATA", { status: 200, headers: { "content-type": "image/jpeg" } }),
    });
    expect(result).toMatchObject({
      action: "employees.photo",
      data: { encoding: "base64", contentType: "image/jpeg" },
    });
  });
});
