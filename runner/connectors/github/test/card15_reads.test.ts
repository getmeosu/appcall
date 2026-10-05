import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { getEmojis, getFeeds, getMeta, listMetaVersions, getOctocat } from "../src/actions";

const READS = ["emojis.get", "feeds.get", "meta.get", "meta.versions.list", "meta.octocat.get"] as const;

const PATHS: Record<(typeof READS)[number], string> = {
  "emojis.get": "GET /emojis",
  "feeds.get": "GET /feeds",
  "meta.get": "GET /meta",
  "meta.versions.list": "GET /versions",
  "meta.octocat.get": "GET /octocat",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("github card-15 reads", () => {
  test("version stays 0.56.0 at 582 ops and the new reads omit effect policy", () => {
    expect(manifest.version).toBe("0.56.0");
    expect(Object.keys(manifest.operations).length).toBe(582);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    const check = manifest.operations["repos.assignees.check"] as Record<string, unknown>;
    expect(String(check.description)).toContain("GET /repos/{owner}/{repo}/assignees/{assignee}");
    expect(manifest.operations["codes_of_conduct.get"]).toBeDefined();
    expect(manifest.operations["events.public.list"]).toBeDefined();
    expect(manifest.operations["gists.star.check"]).toBeDefined();
    expect(manifest.operations["meta.octocat.get"].description).not.toContain("GET /zen");
    expect(manifest.operations["meta.get"].description).not.toContain("GET / ");
  });

  test("200 returns the body, text/plain octocat stays text, and 404 stays upstream", async () => {
    const calls: string[] = [];
    const fetchOf = (response: Response) => async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return response;
    };
    const missing = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return json({ message: "Not Found" }, 404);
    };

    const emojis = await getEmojis({
      accessToken: "t",
      fetch: fetchOf(json({ octocat: "https://github.githubassets.com/images/icons/emoji/octocat.png" })),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/emojis");
    expect((emojis.emojis as Record<string, string>).octocat).toContain("octocat.png");
    await expect(getEmojis({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const feeds = await getFeeds({
      accessToken: "t",
      fetch: fetchOf(json({ timeline_url: "https://github.com/timeline", user_url: "https://github.com/{user}" })),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/feeds");
    expect((feeds.feeds as Record<string, string>).timeline_url).toContain("/timeline");
    await expect(getFeeds({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const meta = await getMeta({
      accessToken: "t",
      fetch: fetchOf(json({ verifiable_password_authentication: true, ssh_key_fingerprints: { SHA256_RSA: "abc" } })),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/meta");
    expect(calls.at(-1)).not.toBe("https://api.github.com/");
    expect((meta.meta as Record<string, unknown>).verifiable_password_authentication).toBe(true);
    await expect(getMeta({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const versions = await listMetaVersions({
      accessToken: "t",
      fetch: fetchOf(json(["2022-11-28", "2026-03-10"])),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/versions");
    expect(versions.versions).toEqual(["2022-11-28", "2026-03-10"]);
    await expect(listMetaVersions({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const art = "               MMM.           .MMM\n               MMMMMMMMMMMMMMMMMMM\n";
    const octocat = await getOctocat({
      accessToken: "t",
      fetch: fetchOf(new Response(art, { status: 200, headers: { "content-type": "text/plain" } })),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/octocat");
    expect(String(calls.at(-1))).not.toContain("/users/");
    expect(octocat.octocat).toBe(art);
    await expect(getOctocat({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
