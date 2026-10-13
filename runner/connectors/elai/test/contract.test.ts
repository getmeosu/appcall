import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../elai.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const liveTools = [
  "ELAI_COPY_VIDEO",
  "ELAI_CREATE_STORY_VIDEO",
  "ELAI_DELETE_VIDEO",
  "ELAI_ESTIMATE_SPEECH_DURATION",
  "ELAI_GET_VIDEO",
  "ELAI_LIST_AVATARS",
  "ELAI_LIST_VIDEOS",
  "ELAI_RENDER_VIDEO",
];

describe("Elai declarative contract", () => {
  test("uses bearer auth on the documented host", () => {
    expect(manifest.key).toBe("elai");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["apis.elai.io"]);
    expect(manifest.http.baseUrl).toBe("https://apis.elai.io/api/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(JSON.stringify(manifest)).not.toContain("{{baseUrl}}");
    expect(JSON.stringify(manifest.http)).not.toContain("Content-Type");
  });

  test("maps the live tool list without a second route or a free-form URL", () => {
    expect(coverage.composio_tools).toBe(8);
    expect(coverage.index_tools).toBe(8);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.full_depth).toBe(true);
    const mapped = coverage.mapped.map((row: { tool: string }) => row.tool);
    const still = coverage.missing_still.map((row: { tool: string }) => row.tool);
    expect([...mapped, ...still].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + still.length).toBe(liveTools.length);
    expect(Object.keys(manifest.operations).sort()).toEqual(mapped.map((tool: string) => {
      const row = coverage.mapped.find((item: { tool: string; operation: string }) => item.tool === tool);
      return row.operation;
    }).sort());
    for (const operation of Object.values(manifest.operations)) {
      expect(operation.inputSchema.type).toBe("object");
      expect(operation.inputSchema.additionalProperties).toBe(false);
      expect(operation.title.length).toBeGreaterThan(0);
      expect(operation.description.length).toBeGreaterThan(0);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.enforceOutputSchema).toBe(true);
      const request = JSON.stringify(operation.request);
      expect(request).not.toContain("http://");
      expect(request).not.toContain("https://");
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(operation.request.body).toBeUndefined();
        expect(JSON.stringify(operation.request.headers ?? {})).not.toContain("Content-Type");
      }
    }
  });

  test("sends bearer auth, encodes the video id, and does not fetch a render URL", async () => {
    const seen: Request[] = [];
    const result = await actions["videos.get"]!({
      apiKey: "secret",
      videoId: "vid/a",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          _id: "vid/a",
          status: "ready",
          url: "https://evil.example/video.mp4",
        });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://apis.elai.io");
    expect(url.pathname).toBe("/api/v1/videos/vid%2Fa");
    expect(result.video.url).toBe("https://evil.example/video.mp4");
  });

  test("keeps render confirmation local and leaves the POST body empty", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ accepted: true });
    };
    await expect(actions["videos.render"]!({ apiKey: "secret", videoId: "vid_1", confirmPaidRender: false, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(seen).toHaveLength(0);
    const result = await actions["videos.render"]!({ apiKey: "secret", videoId: "vid_1", confirmPaidRender: true, fetch });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(new URL(seen[0].url).pathname).toBe("/api/v1/videos/render/vid_1");
    expect(result.accepted).toBe(true);
  });

  test("wraps the avatar JSON array and rejects bad input, empty JSON, 401, and 429", async () => {
    const seen: Request[] = [];
    const listed = await actions["avatars.list"]!({
      apiKey: "secret",
      realtimeCompatible: true,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([{ _id: "gia", name: "Gia" }]);
      },
    });
    expect(new URL(seen[0].url).searchParams.get("realtime")).toBe("true");
    expect(listed.avatars).toHaveLength(1);
    await expect(actions["videos.get"]!({ apiKey: "secret", videoId: "", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["videos.list"]!({ apiKey: "secret", cursor: "next", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["videos.get"]!({ apiKey: "secret", videoId: "vid_1", fetch: async () => new Response("", { status: 200, headers: { "content-type": "application/json" } }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["videos.get"]!({ apiKey: "secret", videoId: "vid_1", fetch: async () => new Response("not-json", { status: 200 }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["videos.list"]!({ apiKey: "secret", fetch: async () => response({ message: "no" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["videos.list"]!({ apiKey: "secret", fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
