import { describe, expect, test } from "bun:test";
import createReleaseFixture from "../fixtures/create_release.json";
import releasesListFixture from "../fixtures/releases_list.json";
import releaseAssetsFixture from "../fixtures/release_assets_list.json";
import tagsListFixture from "../fixtures/tags_list.json";
import createGistFixture from "../fixtures/create_gist.json";
import gistsListFixture from "../fixtures/gists_list.json";
import {
  listReleases,
  getRelease,
  getLatestRelease,
  getReleaseByTag,
  updateRelease,
  listReleaseAssets,
  listTags,
  listGists,
  getGist,
  updateGist,
} from "../src/actions";
import { validateListReleasesInput, validateUpdateReleaseInput, normalizeGitHubRelease } from "../src/releases";
import { validateListGistsInput, validateUpdateGistInput, normalizeGitHubGist } from "../src/gists";
import { validateListTagsInput, normalizeGitHubTag } from "../src/tags";

describe("github S7 releases-tags-gists", () => {
  test("normalizes release/tag/gist fixtures", () => {
    const release = normalizeGitHubRelease(createReleaseFixture as never);
    expect(release.id).toBe("gh-release:800000001");
    expect(release.tagName).toBe("v1.0.0");
    const tag = normalizeGitHubTag(tagsListFixture[0] as never);
    expect(tag.id).toBe("gh-tag:v1.0.0");
    expect(tag.commitSha).toBe("abc123");
    const gist = normalizeGitHubGist(createGistFixture as never);
    expect(gist.id).toBe("gh-gist:aa5a315d61ae9438b18d");
  });

  test("validates S7 inputs", () => {
    expect(validateListReleasesInput({ owner: "acme", repo: "app", perPage: 10 }).perPage).toBe(10);
    expect(() => validateListReleasesInput({ owner: "acme" })).toThrow();
    expect(validateUpdateReleaseInput({ owner: "acme", repo: "app", releaseId: 1, name: "n" }).name).toBe("n");
    expect(validateListTagsInput({ owner: "acme", repo: "app" }).owner).toBe("acme");
    expect(validateListGistsInput({ perPage: 5 }).perPage).toBe(5);
    expect(validateUpdateGistInput({ gistId: "abc", description: "d" }).description).toBe("d");
    expect(() => validateUpdateGistInput({})).toThrow();
  });

  test("listReleases hits /repos/{owner}/{repo}/releases", async () => {
    const requests: Request[] = [];
    const result = await listReleases({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(releasesListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/releases");
    expect((result.releases as unknown[]).length).toBe(2);
  });

  test("getRelease / getLatest / getByTag hit expected paths", async () => {
    const paths: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      paths.push(new Request(input, init).url);
      return new Response(JSON.stringify(createReleaseFixture), { status: 200 });
    };
    await getRelease({ accessToken: "t", owner: "acme", repo: "app", releaseId: 800000001, fetch: fetchFn });
    await getLatestRelease({ accessToken: "t", owner: "acme", repo: "app", fetch: fetchFn });
    await getReleaseByTag({ accessToken: "t", owner: "acme", repo: "app", tag: "v1.0.0", fetch: fetchFn });
    expect(paths[0]).toBe("https://api.github.com/repos/acme/app/releases/800000001");
    expect(paths[1]).toBe("https://api.github.com/repos/acme/app/releases/latest");
    expect(paths[2]).toBe("https://api.github.com/repos/acme/app/releases/tags/v1.0.0");
  });

  test("updateRelease patches release and maps rate limit", async () => {
    const requests: Request[] = [];
    const result = await updateRelease({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      releaseId: 800000001,
      name: "Renamed",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ...createReleaseFixture, name: "Renamed" }), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/releases/800000001");
    expect((result.release as Record<string, unknown>).name).toBe("Renamed");

    await expect(
      updateRelease({
        accessToken: "t",
        owner: "acme",
        repo: "app",
        releaseId: 1,
        fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  test("listReleaseAssets and listTags hit expected paths", async () => {
    const resultAssets = await listReleaseAssets({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      releaseId: 800000001,
      fetch: async () => new Response(JSON.stringify(releaseAssetsFixture), { status: 200 }),
    });
    expect((resultAssets.assets as unknown[]).length).toBe(1);

    const requests: Request[] = [];
    const resultTags = await listTags({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(tagsListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/tags");
    expect((resultTags.tags as unknown[]).length).toBe(2);
  });

  test("listGists / getGist / updateGist", async () => {
    const listed = await listGists({
      accessToken: "t",
      fetch: async () => new Response(JSON.stringify(gistsListFixture), { status: 200 }),
    });
    expect((listed.gists as unknown[]).length).toBe(1);

    const got = await getGist({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      fetch: async (input) => {
        expect(String(input)).toContain("/gists/aa5a315d61ae9438b18d");
        return new Response(JSON.stringify(createGistFixture), { status: 200 });
      },
    });
    expect((got.gist as Record<string, unknown>).description).toBe("Hello World Examples");

    const requests: Request[] = [];
    const updated = await updateGist({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      description: "Updated",
      files: [{ filename: "hello_world.rb", content: "puts 1" }],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ...createGistFixture, description: "Updated" }), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect((updated.gist as Record<string, unknown>).description).toBe("Updated");
  });
});
