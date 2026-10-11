import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { actions as wrapped } from "../src/actions";

const compiled = compileDeclarativeConnector(manifest as never);
const actions = { ...compiled.actions, ...wrapped };
const fixturesRoot = join(import.meta.dir, "../fixtures");

type CaseFile = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials?: Record<string, string>;
  exchanges: Array<{
    request: { method: string; url: string; headers: Record<string, string>; body: string | null };
    response: { status: number; bodyFile?: string };
  }>;
  expected: { kind: string; code?: string; resultFile?: string };
};

function loadCases(): CaseFile[] {
  const dir = join(fixturesRoot, "cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as CaseFile);
}

function jsonFile(rel: string): unknown {
  return JSON.parse(readFileSync(join(fixturesRoot, "cases", rel), "utf8"));
}

const SAMPLE = "https://pdfco-test-files.s3.us-west-2.amazonaws.com/pdf-info/sample.pdf";

describe("pdf-co actions", () => {
  test("executes every fixture case against compiled or handwritten handlers", async () => {
    for (const fixture of loadCases()) {
      const handler = actions[fixture.operation];
      expect(handler, fixture.id).toBeTypeOf("function");
      const input: Record<string, unknown> = { ...fixture.input, ...(fixture.credentials ?? {}) };
      if (fixture.expected.kind === "error" && fixture.exchanges.length === 0) {
        await expect(handler!(input)).rejects.toMatchObject({ code: fixture.expected.code });
        continue;
      }
      const seen: Request[] = [];
      const exchange = fixture.exchanges[0]!;
      input.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(url, init));
        const body = exchange.response.bodyFile
          ? readFileSync(join(fixturesRoot, "cases", exchange.response.bodyFile), "utf8")
          : "{}";
        return new Response(body, {
          status: exchange.response.status,
          headers: { "content-type": "application/json" },
        });
      };
      if (fixture.expected.kind === "error") {
        await expect(handler!(input)).rejects.toMatchObject({ code: fixture.expected.code });
        expect(seen, fixture.id).toHaveLength(1);
        continue;
      }
      const result = await handler!(input);
      const expected = jsonFile(fixture.expected.resultFile!);
      expect(result, fixture.id).toEqual(expected);
      expect(seen, fixture.id).toHaveLength(1);
      expect(seen[0]!.method, fixture.id).toBe(exchange.request.method);
      const actual = new URL(seen[0]!.url);
      const wanted = new URL(exchange.request.url);
      expect(actual.origin + actual.pathname, fixture.id).toBe(wanted.origin + wanted.pathname);
      for (const [key, value] of wanted.searchParams) {
        expect(actual.searchParams.get(key), `${fixture.id} query ${key}`).toBe(value);
      }
      if (exchange.request.body) {
        expect(JSON.parse(await seen[0]!.clone().text()), fixture.id).toEqual(JSON.parse(exchange.request.body));
      } else {
        expect(await seen[0]!.clone().text(), fixture.id).toBe("");
      }
      expect(seen[0]!.headers.get("x-api-key"), fixture.id).toBe(String(fixture.credentials?.apiKey ?? "token"));
    }
  });

  test("pdf.info.get always sends async false and omits unset optionals", async () => {
    const seen: Request[] = [];
    await compiled.actions["pdf.info.get"]!({
      apiKey: "token",
      url: SAMPLE,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(url, init));
        return new Response(JSON.stringify({ error: false, status: 200, info: { PageCount: 1 } }));
      },
    });
    expect(JSON.parse(await seen[0]!.clone().text())).toEqual({ async: false, url: SAMPLE });
  });

  test("file.upload GET uses url query and POST uses base64", async () => {
    const seen: Request[] = [];
    await wrapped["file.upload"]!({
      apiKey: "token",
      url: SAMPLE,
      name: "doc.pdf",
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(url, init));
        return new Response(JSON.stringify({ error: false, url: "https://pdf-temp-files.s3.amazonaws.com/a.pdf" }));
      },
    });
    expect(seen[0]!.method).toBe("GET");
    expect(new URL(seen[0]!.url).pathname).toBe("/v1/file/upload/url");
    expect(new URL(seen[0]!.url).searchParams.get("url")).toBe(SAMPLE);
    expect(new URL(seen[0]!.url).searchParams.get("name")).toBe("doc.pdf");

    seen.length = 0;
    await wrapped["file.upload"]!({
      apiKey: "token",
      file: "data:application/pdf;base64,JVBERi0xLjQ=",
      name: "inline.pdf",
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(url, init));
        return new Response(JSON.stringify({ error: false, url: "https://pdf-temp-files.s3.amazonaws.com/b.pdf" }));
      },
    });
    expect(seen[0]!.method).toBe("POST");
    expect(new URL(seen[0]!.url).pathname).toBe("/v1/file/upload/base64");
    expect(JSON.parse(await seen[0]!.clone().text())).toEqual({
      file: "data:application/pdf;base64,JVBERi0xLjQ=",
      name: "inline.pdf",
    });
  });

  test("pdf.convert.to.image routes PNG JPG TIFF", async () => {
    const paths: string[] = [];
    const fetch = async (url: RequestInfo | URL) => {
      paths.push(new URL(String(url)).pathname);
      return new Response(JSON.stringify({ error: false, urls: ["https://pdf-temp-files.s3.amazonaws.com/p.png"] }));
    };
    await wrapped["pdf.convert.to.image"]!({ apiKey: "token", url: SAMPLE, fetch });
    await wrapped["pdf.convert.to.image"]!({ apiKey: "token", url: SAMPLE, imageFormat: "JPG", fetch });
    await wrapped["pdf.convert.to.image"]!({ apiKey: "token", url: SAMPLE, imageFormat: "TIFF", fetch });
    expect(paths).toEqual(["/v1/pdf/convert/to/png", "/v1/pdf/convert/to/jpg", "/v1/pdf/convert/to/tiff"]);
  });

  test("echoes validated input without credentials and demotes error:true", async () => {
    const echoed = await compiled.actions["pdf.merge"]!({ urls: `${SAMPLE},${SAMPLE}` });
    expect(echoed).toMatchObject({
      connector: "pdf-co",
      action: "pdf.merge",
      source: "connector",
      validated: { urls: `${SAMPLE},${SAMPLE}` },
    });
    await expect(
      compiled.actions["pdf.merge"]!({
        apiKey: "token",
        urls: `${SAMPLE},${SAMPLE}`,
        fetch: async () => new Response(JSON.stringify({ error: true, status: 200, message: "bad merge" })),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 401 and 429 on healthcheck", async () => {
    await expect(
      compiled.actions.healthcheck!({ apiKey: "bad", fetch: async () => new Response("{}", { status: 401 }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      compiled.actions.healthcheck!({
        apiKey: "token",
        fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
