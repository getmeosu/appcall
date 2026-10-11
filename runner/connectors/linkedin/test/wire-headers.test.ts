// Every request the linkedin connector sends to api.linkedin.com, across every
// success fixture and every posts.create scenario: /rest/ paths carry
// Linkedin-Version 202609 and X-Restli-Protocol-Version 2.0.0; /v2/ paths carry
// X-Restli-Protocol-Version 2.0.0 and never Linkedin-Version.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { createPost } from "../src/actions";
import { batchGetImages, deleteShare, getOrganizationPageStats, getVideos, publishPost, registerImageUpload, uploadVideo } from "../src/depth";
import { LINKEDIN_VERSION } from "../src/http";

const compiled = compileDeclarativeConnector(manifest as never);
const HANDLERS: Record<string, (input: unknown) => unknown> = {
  "posts.create": createPost,
  "posts.publish": publishPost,
  "posts.share.delete": deleteShare,
  "images.batchGet": batchGetImages,
  "organizations.pageStats.get": getOrganizationPageStats,
  "videos.get": getVideos,
  "assets.registerUpload": registerImageUpload,
  "videos.upload": uploadVideo,
};

type Seen = { op: string; method: string; url: URL; headers: Headers };

async function replay(op: string, input: Record<string, unknown>, responses: Array<{ status: number; headers?: Record<string, string>; body: string | Uint8Array | null }>, seen: Seen[]) {
  let index = 0;
  const action = compiled.actions[op] ?? HANDLERS[op];
  if (!action) throw new Error(`no action for ${op}`);
  const fetch = async (url: RequestInfo | URL, init: RequestInit = {}) => {
    seen.push({ op, method: String(init.method ?? "GET"), url: new URL(String(url)), headers: new Headers(init.headers as HeadersInit) });
    const response = responses[index++] ?? { status: 200, body: "{}" };
    return new Response(response.body, { status: response.status, headers: response.headers });
  };
  try {
    await action({ ...input, fetch });
  } catch {
    // Error scenarios still count: only the requests matter here.
  }
}

describe("linkedin wire headers", () => {
  test("every /rest/ request is versioned and no /v2/ request is", async () => {
    const seen: Seen[] = [];
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    for (const file of readdirSync(caseDir).sort()) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8"));
      if (!raw.exchanges?.length) continue;
      const responses = raw.exchanges.map((exchange: any) => ({
        status: exchange.response.status,
        headers: exchange.response.headers,
        body: exchange.response.bodyFile ? readFileSync(join(dirname(join(caseDir, file)), exchange.response.bodyFile)) : null,
      }));
      await replay(raw.operation, { ...raw.input, ...raw.credentials }, responses, seen);
    }
    const scenarioDir = join(import.meta.dir, "../fixtures/posts_create");
    for (const file of readdirSync(scenarioDir).sort()) {
      const raw = JSON.parse(readFileSync(join(scenarioDir, file), "utf8"));
      const responses = raw.exchanges.map((exchange: any) => ({
        status: exchange.response.status,
        headers: exchange.response.headers,
        body: exchange.response.body === null ? null : JSON.stringify(exchange.response.body),
      }));
      await replay("posts.create", { ...raw.input, accessToken: "test-value" }, responses, seen);
    }

    const api = seen.filter((call) => call.url.origin === "https://api.linkedin.com");
    const rest = api.filter((call) => call.url.pathname.startsWith("/rest/"));
    const v2 = api.filter((call) => call.url.pathname.startsWith("/v2/"));
    expect(api.length).toBe(rest.length + v2.length);
    expect(rest.length).toBeGreaterThan(20);
    expect(v2.length).toBeGreaterThan(5);

    const bad: string[] = [];
    for (const call of rest) {
      if (call.headers.get("linkedin-version") !== LINKEDIN_VERSION) bad.push(`${call.op} ${call.method} ${call.url.pathname} linkedin-version=${call.headers.get("linkedin-version")}`);
      if (call.headers.get("x-restli-protocol-version") !== "2.0.0") bad.push(`${call.op} ${call.method} ${call.url.pathname} x-restli-protocol-version=${call.headers.get("x-restli-protocol-version")}`);
    }
    for (const call of v2) {
      if (call.headers.get("linkedin-version") !== null) bad.push(`${call.op} ${call.method} ${call.url.pathname} sent linkedin-version on /v2/`);
      if (call.headers.get("x-restli-protocol-version") !== "2.0.0") bad.push(`${call.op} ${call.method} ${call.url.pathname} x-restli-protocol-version=${call.headers.get("x-restli-protocol-version")}`);
    }
    expect(bad).toEqual([]);

    const restOps = new Set(rest.map((call) => call.op));
    for (const op of ["posts.create", "posts.publish", "posts.get", "posts.delete", "comments.create", "images.get", "images.batchGet", "videos.upload"]) {
      expect(restOps.has(op)).toBe(true);
    }
    expect(v2.some((call) => call.op === "posts.create" && call.url.pathname === "/v2/ugcPosts")).toBe(true);
    expect(v2.some((call) => call.op === "posts.create" && call.url.pathname === "/v2/userinfo")).toBe(true);
  });

  test("every operation with a live request appears in the sweep", () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const ops = new Set<string>();
    for (const file of readdirSync(caseDir)) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8"));
      if (raw.exchanges?.length) ops.add(raw.operation);
    }
    const local = new Set(["profile.get", "posts.list", "organizations.list", "healthcheck"]);
    for (const op of Object.keys(manifest.operations)) {
      if (!local.has(op)) expect(ops.has(op)).toBe(true);
    }
  });
});
