import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
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
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
  const q = (u: URL) =>
    [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return (
      ak.length === bk.length &&
      ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return false;
}

describe("amara HTTP contract", () => {
  test("uses x-api-key and does not follow pagination links", async () => {
    const seen: Request[] = [];
    const payload = { meta: { total_count: 1 }, objects: [{ id: "NI1hLjBxuTpk" }] };
    const result = await actions["videos.list"]!({
      apiKey: "secret",
      limit: 20,
      offset: 0,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(payload);
      },
    });
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(new URL(seen[0].url).pathname).toBe("/api/videos/");
    expect(new URL(seen[0].url).searchParams.get("limit")).toBe("20");
    expect(result).toMatchObject({ data: payload, connector: "amara", action: "videos.list" });
    expect(seen).toHaveLength(1);
  });

  test("keeps origin videoId path segment", async () => {
    const seen: Request[] = [];
    await actions["videos.get"]!({
      apiKey: "secret",
      videoId: "NI1hLjBxuTpk",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ id: "NI1hLjBxuTpk" });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/videos/NI1hLjBxuTpk/");
  });

  test("maps unauthorized healthcheck", async () => {
    await expect(actions.healthcheck!({ apiKey: "secret", fetch: async () => response({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("creates a video as JSON against /videos/", async () => {
    const seen: Request[] = [];
    const result = await actions["videos.create"]!({
      apiKey: "secret",
      title: "Dogs and Cats",
      video_url: "https://example.com/video.mp4",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ id: "PO0pMxxtXvZA", title: "Dogs and Cats" }, 201);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/api/videos/");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(await seen[0].text())).toEqual({
      title: "Dogs and Cats",
      video_url: "https://example.com/video.mp4",
    });
    expect(result).toMatchObject({ data: { id: "PO0pMxxtXvZA" }, action: "videos.create" });
  });

  test("sends messages to official /message/", async () => {
    const seen: Request[] = [];
    await actions["messages.send"]!({
      apiKey: "secret",
      subject: "Hello",
      content: "Hello world",
      user: "bendk",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({}, 201);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/api/message/");
    expect(JSON.parse(await seen[0].text())).toEqual({ content: "Hello world", subject: "Hello", user: "bendk" });
  });

  test("uses official subtitle notes and actions paths", async () => {
    const seen: Request[] = [];
    await actions["videos.subtitles.notes.list"]!({
      apiKey: "secret",
      video_id: "NI1hLjBxuTpk",
      language_code: "en",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ objects: [] });
      },
    });
    await actions["videos.subtitles.actions.list"]!({
      apiKey: "secret",
      video_id: "NI1hLjBxuTpk",
      language_code: "en",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([]);
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/videos/NI1hLjBxuTpk/languages/en/subtitles/notes/");
    expect(new URL(seen[1].url).pathname).toBe("/api/videos/NI1hLjBxuTpk/languages/en/subtitles/actions/");
  });

  test("maps Composio language to official language_code on create", async () => {
    const seen: Request[] = [];
    await actions["videos.languages.create"]!({
      apiKey: "secret",
      video_id: "NI1hLjBxuTpk",
      language: "en",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ language_code: "en" }, 201);
      },
    });
    expect(JSON.parse(await seen[0].text())).toEqual({ language_code: "en" });
  });

  test("looks up a public URL via official video_url filter", async () => {
    const seen: Request[] = [];
    await actions["videos.lookup"]!({
      apiKey: "secret",
      url: "http://www.youtube.com/watch?v=o0vnlylsQwc",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ objects: [] });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/videos/");
    expect(new URL(seen[0].url).searchParams.get("video_url")).toBe("http://www.youtube.com/watch?v=o0vnlylsQwc");
  });

  test("forwards Composio sort as official order_by", async () => {
    const seen: Request[] = [];
    await actions["videos.list"]!({
      apiKey: "secret",
      sort: "-created",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ objects: [] });
      },
    });
    expect(new URL(seen[0].url).searchParams.get("order_by")).toBe("-created");
    expect(new URL(seen[0].url).searchParams.get("sort")).toBeNull();
  });

  test("fetches subtitles as JSON using sub_format", async () => {
    const seen: Request[] = [];
    await actions["videos.subtitles.get"]!({
      apiKey: "secret",
      video_id: "NI1hLjBxuTpk",
      language_code: "en",
      format: "json",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ subtitles: [] });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/videos/NI1hLjBxuTpk/languages/en/subtitles/");
    expect(new URL(seen[0].url).searchParams.get("sub_format")).toBe("json");
  });

  test("deletes a video URL with DELETE and empty 204", async () => {
    const seen: Request[] = [];
    const result = await actions["videos.urls.delete"]!({
      apiKey: "secret",
      video_id: "NI1hLjBxuTpk",
      url_id: 1839769,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(seen[0].method).toBe("DELETE");
    expect(new URL(seen[0].url).pathname).toBe("/api/videos/NI1hLjBxuTpk/urls/1839769/");
    expect(result).toMatchObject({ data: { ok: true } });
  });

  test("sends team_activity as official team-activity", async () => {
    const seen: Request[] = [];
    await actions["activity.list"]!({
      apiKey: "secret",
      team: "demo-team",
      team_activity: true,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ objects: [] });
      },
    });
    expect(new URL(seen[0].url).searchParams.get("team-activity")).toBe("true");
    expect(new URL(seen[0].url).searchParams.get("team")).toBe("demo-team");
  });
});

describe("amara compiled actions", () => {
  test("compiles one handler per action", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("amara fixture replay", () => {
  const cases = loadCases();

  test("has a fixture for every action", () => {
    expect(new Set(cases.map((fixtureCase) => fixtureCase.operation))).toEqual(new Set(Object.keys(manifest.operations)));
  });

  test("replays every fixture case", async () => {
    for (const fixtureCase of cases) {
      const action = actions[fixtureCase.operation];
      expect(action, fixtureCase.id).toBeDefined();
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const expected = fixtureCase.exchanges[index++];
        if (!expected) throw new Error(`${fixtureCase.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(
            `${fixtureCase.id}: request mismatch ${method} ${url} vs ${expected.request.method} ${expected.request.url}`,
          );
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) {
          throw new Error(`${fixtureCase.id}: body mismatch ${body} vs ${expected.request.body}`);
        }
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expected.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          if (gotHeaders.get(key) !== value) throw new Error(`${fixtureCase.id}: header mismatch ${key}`);
        }
        for (const [key] of gotHeaders) {
          if (!expectedHeaders.has(key) && key !== "content-length") {
            throw new Error(`${fixtureCase.id}: unexpected header ${key}`);
          }
        }
        const bodyBytes = readFileSync(join(dirname(join(casesDir, `${fixtureCase.id}.json`)), expected.response.bodyFile));
        return new Response(bodyBytes, { status: expected.response.status, headers: expected.response.headers });
      };
      const payload = { ...fixtureCase.input, ...fixtureCase.credentials, fetch: fetchStub };
      if (fixtureCase.expected.kind === "error") {
        try {
          await action!(payload);
          throw new Error(`${fixtureCase.id}: expected ${fixtureCase.expected.code}`);
        } catch (error) {
          expect((error as { code?: string }).code, fixtureCase.id).toBe(fixtureCase.expected.code);
        }
        continue;
      }
      const result = await action!(payload);
      const expected = JSON.parse(readFileSync(join(casesDir, fixtureCase.expected.resultFile), "utf8"));
      if (!deepEqual(result, expected)) {
        throw new Error(`${fixtureCase.id}: result mismatch ${JSON.stringify(result)} vs ${JSON.stringify(expected)}`);
      }
      expect(index).toBe(fixtureCase.exchanges.length);
    }
  });
});
