import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const res = (b: unknown, s = 200, h?: HeadersInit) => new Response(JSON.stringify(b), { status: s, headers: h });
const creds = { apiKey: "fixture-kommo-token", subdomain: "acme" };

describe("kommo origin contract", () => {
  test("Bearer token and subdomain host on origin operations", async () => {
    for (const n of ["healthcheck", "leads.list", "contacts.list", "pipelines.list", "users.list"] as const) {
      const seen: Request[] = [];
      await actions[n]!({
        ...creds,
        fetch: async (i: RequestInfo | URL, x?: RequestInit) => {
          seen.push(new Request(i, x));
          return res({ id: 1 });
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]!.headers.get("authorization")).toBe("Bearer fixture-kommo-token");
      expect(new URL(seen[0]!.url).hostname).toBe("acme.kommo.com");
    }
  });

  test("origin fixture URLs stay byte-stable without extra filters", async () => {
    const seen: Request[] = [];
    const capture = async (i: RequestInfo | URL, x?: RequestInit) => {
      seen.push(new Request(i, x));
      return res({ _embedded: {} });
    };
    await actions["leads.list"]!({ ...creds, page: 1, limit: 50, query: "Lead", fetch: capture });
    expect(seen[0]!.url).toBe("https://acme.kommo.com/api/v4/leads?limit=50&page=1&query=Lead");
    seen.length = 0;
    await actions["contacts.list"]!({ ...creds, page: 1, limit: 50, fetch: capture });
    expect(seen[0]!.url).toBe("https://acme.kommo.com/api/v4/contacts?limit=50&page=1");
    seen.length = 0;
    await actions["users.list"]!({ ...creds, page: 1, limit: 50, fetch: capture });
    expect(seen[0]!.url).toBe("https://acme.kommo.com/api/v4/users?limit=50&page=1");
    seen.length = 0;
    await actions.healthcheck!({ ...creds, fetch: capture });
    expect(seen[0]!.url).toBe("https://acme.kommo.com/api/v4/account");
    seen.length = 0;
    await actions["pipelines.list"]!({ ...creds, fetch: capture });
    expect(seen[0]!.url).toBe("https://acme.kommo.com/api/v4/leads/pipelines");
  });

  test("rejects extra healthcheck fields and oversize lead limits", async () => {
    await expect(actions.healthcheck!({ ...creds, unknownField: "nope", fetch: async () => res({}) })).rejects.toBeTruthy();
    await expect(actions["leads.list"]!({ ...creds, page: 1, limit: 251, fetch: async () => res({}) })).rejects.toBeTruthy();
  });

  test("errors malformed", async () => {
    await expect(actions.healthcheck!({ ...creds, fetch: async () => res({ detail: "nope" }, 401) })).rejects.toBeTruthy();
    await expect(actions["leads.list"]!({ ...creds, fetch: async () => res({}, 429, { "retry-after": "7" }) })).rejects.toBeTruthy();
  });

  test("create lead posts a one-element array body", async () => {
    const seen: Request[] = [];
    await actions["leads.create"]!({
      ...creds,
      name: "Deal",
      price: 100,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ _embedded: { leads: [{ id: 1 }] } });
      },
    });
    expect(seen[0]!.method).toBe("POST");
    expect(new URL(seen[0]!.url).pathname).toBe("/api/v4/leads");
    expect(JSON.parse(await seen[0]!.text())).toEqual([{ name: "Deal", price: 100 }]);
  });

  test("files.list uses drive-c and files.delete is destructive", async () => {
    const seen: Request[] = [];
    await actions["files.list"]!({
      ...creds,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ _embedded: { files: [] } });
      },
    });
    expect(new URL(seen[0]!.url).hostname).toBe("drive-c.kommo.com");
    expect(new URL(seen[0]!.url).pathname).toBe("/v1.0/files");
    expect((manifest.operations as Record<string, { sideEffect: string }>)["files.delete"].sideEffect).toBe("destructive");
  });

  test("AI source file posts to airewriter.kommo.com", async () => {
    const seen: Request[] = [];
    await actions["ai.sources.file.add"]!({
      ...creds,
      url: "https://drive-c.kommo.com/download/file.docx",
      lang: "en",
      file_uuid: "550e8400-e29b-41d4-a716-446655440000",
      available_functions: ["agent"],
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ code: 201, status: "success" }, 201);
      },
    });
    expect(new URL(seen[0]!.url).hostname).toBe("airewriter.kommo.com");
    expect(new URL(seen[0]!.url).pathname).toBe("/api/v2/sources/file");
    expect(JSON.parse(await seen[0]!.text())).toMatchObject({ lang: "en", available_functions: ["agent"] });
  });

  test("contacts.list filter_ids explode as filter[id][]", async () => {
    const seen: Request[] = [];
    await actions["contacts.list"]!({
      ...creds,
      filter_ids: [10, 20],
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res({ _embedded: { contacts: [] } });
      },
    });
    const url = new URL(seen[0]!.url);
    expect(url.searchParams.getAll("filter[id][]")).toEqual(["10", "20"]);
  });

  test("airewriter file source sends an array and product import sends no body", async () => {
    const fixtureRoot = join(import.meta.dir, "../fixtures");
    const names = [
      "ai-airewriter-sources-file-add-success.json",
      "ai-airewriter-products-import-success.json",
    ];
    for (const name of names) {
      const fixture = JSON.parse(readFileSync(join(fixtureRoot, "cases", name), "utf8"));
      const exchange = fixture.exchanges[0];
      const seen: Array<{ url: string; init?: RequestInit }> = [];
      const bodyFile = join(fixtureRoot, "cases", exchange.response.bodyFile);
      const result = await actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
          seen.push({ url: String(url), init });
          return new Response(readFileSync(bodyFile), {
            status: exchange.response.status,
            headers: exchange.response.headers,
          });
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]!.init?.method).toBe(exchange.request.method);
      expect(seen[0]!.url).toBe(exchange.request.url);
      const headers = new Headers(seen[0]!.init?.headers);
      expect(headers.get("authorization")).toBe("Bearer fixture-kommo-token");
      expect(headers.get("x-language")).toBeNull();
      const body = seen[0]!.init?.body == null ? null : String(seen[0]!.init?.body);
      expect(body).toBe(exchange.request.body);
      if (fixture.operation === "ai.airewriter.sources.file.add") {
        expect(typeof body).toBe("string");
        expect(JSON.parse(body as string).available_functions).toEqual(["agent"]);
        expect(headers.get("content-type")).toBe("application/json");
      } else {
        expect(body).toBeNull();
        expect(headers.get("content-type")).toBeNull();
      }
      const expected = JSON.parse(readFileSync(join(fixtureRoot, "cases", fixture.expected.resultFile), "utf8"));
      expect(result).toEqual(expected);
    }

    const seen: Array<{ url: string; init?: RequestInit }> = [];
    await actions["ai.airewriter.sources.file.add"]!({
      ...creds,
      url: "https://drive-c.kommo.com/download/file.docx",
      fileUuid: "550e8400-e29b-41d4-a716-446655440000",
      lang: "en",
      availableFunctions: ["suggested_reply"],
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ url: String(url), init });
        return res({ id: 1, name: "file.docx", updated_at: 1739451881, updated_by: 1 });
      },
    });
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({
      url: "https://drive-c.kommo.com/download/file.docx",
      file_uuid: "550e8400-e29b-41d4-a716-446655440000",
      lang: "en",
      available_functions: ["suggested_reply"],
    });
    await expect(actions["ai.airewriter.sources.file.add"]!({
      ...creds,
      url: "https://drive-c.kommo.com/download/file.docx",
      fileUuid: "550e8400-e29b-41d4-a716-446655440000",
      lang: "en",
      availableFunctions: ["agent"],
      extra: true,
      fetch: async () => res({}),
    })).rejects.toBeTruthy();
    await expect(actions["ai.airewriter.products.import"]!({
      ...creds,
      language: "en",
      fetch: async () => res({ code: 201, status: "success" }, 201),
    })).rejects.toBeTruthy();
  });
});
