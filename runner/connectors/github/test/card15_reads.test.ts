import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import emojisFixture from "../fixtures/emojis.json";
import feedsFixture from "../fixtures/feeds.json";
import metaFixture from "../fixtures/meta.json";
import versionsFixture from "../fixtures/versions.json";
import {
  getEmojis,
  getFeeds,
  getMeta,
  listMetaVersions,
  getOctocat,
} from "../src/actions";
import {
  validateGetEmojisInput,
  validateGetFeedsInput,
  validateGetMetaInput,
  validateListMetaVersionsInput,
  validateGetOctocatInput,
} from "../src/card15_reads";

const READS = [
  "emojis.get",
  "feeds.get",
  "meta.get",
  "meta.versions.list",
  "meta.octocat.get",
] as const;

const OCTOCAT = "               MMM.           .MMM\n               MMMMMMMMMMMMMMMMMMM\n";

describe("github card15 emoji feed and meta reads", () => {
  test("version stays 0.46.0 and the five reads omit effect fields", () => {
    expect(manifest.version).toBe("0.46.0");
    expect(READS).toHaveLength(5);
    expect(Object.keys(manifest.operations)).toHaveLength(484);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["emojis.get"].description).toContain("GET /emojis");
    expect(manifest.operations["feeds.get"].description).toContain("GET /feeds");
    expect(manifest.operations["meta.get"].description).toContain("GET /meta");
    expect(manifest.operations["meta.get"].description).not.toContain("GET / ");
    expect(manifest.operations["meta.versions.list"].description).toContain("GET /versions");
    expect(manifest.operations["meta.octocat.get"].description).toContain("GET /octocat");
    expect(manifest.operations["meta.octocat.get"].description).not.toContain("GET /zen");
    expect(manifest.operations["meta.zen.get"]).toBeDefined();
  });

  test("reads the documented paths with the bearer token", async () => {
    const seen: string[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(url);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer t");
      expect(headers.Accept).toBe("application/vnd.github+json");
      if (url.endsWith("/emojis")) return json(emojisFixture);
      if (url.endsWith("/feeds")) return json(feedsFixture);
      if (url === "https://api.github.com/meta") return json(metaFixture);
      if (url.endsWith("/versions")) return json(versionsFixture);
      if (url.endsWith("/octocat")) return new Response(OCTOCAT, { status: 200, headers: { "content-type": "text/plain" } });
      return new Response("{}", { status: 500 });
    };
    const emojis = await getEmojis({ accessToken: "t", fetch });
    expect((emojis.emojis as Record<string, string>).octocat).toContain("octocat.png");
    const feeds = await getFeeds({ accessToken: "t", fetch });
    expect((feeds.feeds as Record<string, string>).timeline_url).toBe("https://github.com/timeline");
    const meta = await getMeta({ accessToken: "t", fetch });
    expect((meta.meta as Record<string, unknown>).verifiable_password_authentication).toBe(true);
    const versions = await listMetaVersions({ accessToken: "t", fetch });
    expect(versions.versions).toEqual(["2022-11-28", "2026-03-10"]);
    const octocat = await getOctocat({ accessToken: "t", fetch });
    expect(octocat.octocat).toBe(OCTOCAT);
    expect(seen).toEqual([
      "https://api.github.com/emojis",
      "https://api.github.com/feeds",
      "https://api.github.com/meta",
      "https://api.github.com/versions",
      "https://api.github.com/octocat",
    ]);
    expect(seen).not.toContain("https://api.github.com/");
    expect(seen.some((url) => url.includes("/users/"))).toBe(false);
  });

  test("a normal 404 is CONNECTOR_UPSTREAM_ERROR", async () => {
    const missing = async () => new Response("", { status: 404 });
    const denied = async () => new Response("", { status: 401 });
    await expect(getEmojis({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getFeeds({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getMeta({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listMetaVersions({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOctocat({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getMeta({ accessToken: "t", fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    expect(validateGetEmojisInput({})).toEqual({});
    expect(validateGetEmojisInput(undefined)).toEqual({});
    expect(validateGetFeedsInput({})).toEqual({});
    expect(validateGetMetaInput({})).toEqual({});
    expect(validateListMetaVersionsInput({})).toEqual({});
    expect(validateGetOctocatInput({})).toEqual({});
    expect(() => validateGetEmojisInput("nope")).toThrow(/emojis.get input must be an object/);
    const validated = getEmojis({});
    expect(validated.validated).toEqual({});
    expect(getFeeds({}).validated).toEqual({});
    expect(getMeta({}).validated).toEqual({});
    expect(listMetaVersions({}).validated).toEqual({});
    expect(getOctocat({}).validated).toEqual({});
  });
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
