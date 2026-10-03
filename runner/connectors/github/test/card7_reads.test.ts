import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import forksFixture from "../fixtures/repo_forks.json";
import topicsFixture from "../fixtures/search_topics.json";
import labelsFixture from "../fixtures/search_labels.json";
import {
  listRepoForks,
  searchTopics,
  searchLabels,
} from "../src/actions";
import {
  validateListRepoForksInput,
  validateSearchTopicsInput,
  validateSearchLabelsInput,
} from "../src/card7_reads";

const READS = ["repos.forks.list", "search.topics.list", "search.labels.list"] as const;

describe("github card-7 reads", () => {
  test("manifest stays v0.37.0 at 358 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.37.0");
    expect(manifest.version).not.toBe("0.35.0");
    expect(Object.keys(manifest.operations).length).toBe(358);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    const fork = manifest.operations["repos.fork"] as Record<string, unknown>;
    expect(fork.sideEffect).toBe("write");
    expect(fork.effectPolicy).toBe("Reconcile");
    expect(fork.reconcile).toBe("repos.get");
    for (const key of ["repos.topics.get", "labels.list", "labels.get", "issues.labels.list"] as const) {
      expect(manifest.operations[key]).toBeDefined();
    }
  });

  test("validates required fields and official pagination", () => {
    expect(validateListRepoForksInput({
      owner: "octocat",
      repo: "Hello-World",
      sort: "stargazers",
      perPage: 10,
      page: 2,
    })).toEqual({ owner: "octocat", repo: "Hello-World", sort: "stargazers", perPage: 10, page: 2 });
    expect(() => validateListRepoForksInput({ owner: "octo/cat", repo: "Hello-World" })).toThrow(/owner/);
    expect(() => validateListRepoForksInput({ owner: "octocat", repo: "Hello-World", sort: "stars" })).toThrow(/sort/);
    expect(() => validateListRepoForksInput({ owner: "octocat", repo: "Hello-World", perPage: 101 })).toThrow(/perPage/);
    expect(validateSearchTopicsInput({ q: "ruby is:featured", perPage: 5, page: 2 })).toEqual({
      q: "ruby is:featured",
      perPage: 5,
      page: 2,
    });
    expect(() => validateSearchTopicsInput({ q: "ruby", sort: "stars" })).toThrow(/sort or order/);
    expect(() => validateSearchTopicsInput({})).toThrow(/q/);
    expect(validateSearchLabelsInput({
      repository_id: 64778136,
      q: "bug defect",
      sort: "updated",
      order: "asc",
      perPage: 10,
      page: 1,
    }).repository_id).toBe(64778136);
    expect(() => validateSearchLabelsInput({ q: "bug" })).toThrow(/repository_id/);
    expect(() => validateSearchLabelsInput({ repository_id: 1, q: "bug", sort: "best" })).toThrow(/sort/);
  });

  test("lists forks with an encoded path and page query", async () => {
    const result = await listRepoForks({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      sort: "newest",
      perPage: 30,
      page: 2,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/forks?sort=newest&per_page=30&page=2");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(String(input)).not.toContain("POST");
        return new Response(JSON.stringify(forksFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("repos.forks.list");
    expect((result.forks as { fullName: string; fork: boolean; owner: string }[])[0]).toMatchObject({
      fullName: "octocat/Hello-World",
      fork: true,
      owner: "octocat",
    });
  });

  test("searches topics with required q and no sort", async () => {
    const result = await searchTopics({
      accessToken: "t",
      q: "ruby is:featured",
      perPage: 5,
      page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/search/topics?q=ruby+is%3Afeatured&per_page=5&page=2");
        return new Response(JSON.stringify(topicsFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("search.topics.list");
    expect(result.totalCount).toBe(1);
    expect(result.incompleteResults).toBe(false);
    expect((result.items as { name: string; featured: boolean; displayName: string }[])[0]).toMatchObject({
      name: "ruby",
      displayName: "Ruby",
      featured: true,
    });
  });

  test("searches labels with required repository_id and q", async () => {
    const result = await searchLabels({
      accessToken: "t",
      repository_id: 64778136,
      q: "bug defect",
      sort: "updated",
      order: "asc",
      perPage: 10,
      page: 1,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/search/labels?repository_id=64778136&q=bug+defect&sort=updated&order=asc&per_page=10&page=1");
        return new Response(JSON.stringify(labelsFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("search.labels.list");
    expect((result.items as { name: string; color: string; default: boolean }[])[0]).toMatchObject({
      name: "bug",
      color: "d73a4a",
      default: true,
    });
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listRepoForks({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
    await expect(listRepoForks({
      accessToken: "t",
      owner: "missing",
      repo: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(searchTopics({
      accessToken: "t",
      q: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(searchLabels({
      accessToken: "t",
      repository_id: 1,
      q: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(searchLabels({
      accessToken: "t",
      repository_id: 1,
      q: "???",
      fetch: async () => new Response("{}", { status: 422 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = searchTopics({ q: "ruby" });
    expect(result.action).toBe("search.topics.list");
    expect(result.validated).toEqual({ q: "ruby", perPage: undefined, page: undefined });
  });
});
