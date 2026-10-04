import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import contributorsFixture from "../fixtures/stats_contributors.json";
import viewsFixture from "../fixtures/traffic_views.json";
import clonesFixture from "../fixtures/traffic_clones.json";
import punchFixture from "../fixtures/stats_punch_card.json";
import activityFixture from "../fixtures/stats_commit_activity.json";
import frequencyFixture from "../fixtures/stats_code_frequency.json";
import participationFixture from "../fixtures/stats_participation.json";
import pathsFixture from "../fixtures/traffic_popular_paths.json";
import referrersFixture from "../fixtures/traffic_popular_referrers.json";
import {
  listRepoStatsContributors,
  getRepoTrafficViews,
  getRepoTrafficClones,
  getRepoStatsPunchCard,
  listRepoStatsCommitActivity,
  getRepoStatsCodeFrequency,
  getRepoStatsParticipation,
  listRepoTrafficPopularPaths,
  listRepoTrafficPopularReferrers,
} from "../src/actions";
import {
  validateGetTrafficViewsInput,
  validateListStatsContributorsInput,
} from "../src/traffic";

const READS = [
  "repos.stats.contributors.list",
  "repos.traffic.views.get",
  "repos.traffic.clones.get",
  "repos.stats.punch_card.get",
  "repos.stats.commit_activity.list",
  "repos.stats.code_frequency.get",
  "repos.stats.participation.get",
  "repos.traffic.popular.paths.list",
  "repos.traffic.popular.referrers.list",
] as const;

describe("github traffic and repository statistics reads", () => {
  test("manifest is v0.44.0 with 434 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(Object.keys(manifest.operations).length).toBe(434);
    expect(READS).toHaveLength(9);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
  });

  test("validates owner, repo, and the views per window", () => {
    expect(validateListStatsContributorsInput({ owner: "acme", repo: "app" })).toEqual({ owner: "acme", repo: "app" });
    expect(() => validateListStatsContributorsInput({ owner: "acme/team", repo: "app" })).toThrow(/single path segment/);
    expect(() => validateListStatsContributorsInput({})).toThrow(/owner is required/);
    expect(validateGetTrafficViewsInput({ owner: "acme", repo: "app", per: "week" }).per).toBe("week");
    expect(validateGetTrafficViewsInput({ owner: "acme", repo: "app" }).per).toBeUndefined();
    expect(() => validateGetTrafficViewsInput({ owner: "acme", repo: "app", per: "month" })).toThrow(/per must be day or week/);
    expect(() => validateGetTrafficViewsInput([])).toThrow(/input must be an object/);
  });

  test("reads stats and traffic from the documented paths", async () => {
    const contributors = await listRepoStatsContributors({
      accessToken: "t", owner: "ac me", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/ac%20me/app/stats/contributors");
        return new Response(JSON.stringify(contributorsFixture), { status: 200 });
      },
    });
    expect(contributors.action).toBe("repos.stats.contributors.list");
    expect(contributors.contributors).toEqual([
      { login: "octocat", id: 1, total: 3, weeks: [{ w: 1700000000, a: 1, d: 0, c: 1 }] },
    ]);

    const views = await getRepoTrafficViews({
      accessToken: "t", owner: "acme", repo: "app", per: "week",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/traffic/views?per=week");
        return new Response(JSON.stringify(viewsFixture), { status: 200 });
      },
    });
    expect(views.views).toEqual({ count: 2, uniques: 1, points: [{ timestamp: "2026-05-01T00:00:00Z", count: 2, uniques: 1 }] });

    const clones = await getRepoTrafficClones({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/traffic/clones");
        return new Response(JSON.stringify(clonesFixture), { status: 200 });
      },
    });
    expect((clones.clones as { count: number }).count).toBe(4);

    const punch = await getRepoStatsPunchCard({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/stats/punch_card");
        return new Response(JSON.stringify(punchFixture), { status: 200 });
      },
    });
    expect(punch.punchCard).toEqual([{ day: 2, hour: 14, commits: 25 }]);

    const activity = await listRepoStatsCommitActivity({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/stats/commit_activity");
        return new Response(JSON.stringify(activityFixture), { status: 200 });
      },
    });
    expect(activity.activity).toEqual([{ days: [0, 1, 0, 0, 0, 0, 0], total: 1, week: 1700000000 }]);

    const frequency = await getRepoStatsCodeFrequency({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/stats/code_frequency");
        return new Response(JSON.stringify(frequencyFixture), { status: 200 });
      },
    });
    expect(frequency.frequency).toEqual([{ week: 1700000000, additions: 10, deletions: -2 }]);

    const participation = await getRepoStatsParticipation({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/stats/participation");
        return new Response(JSON.stringify(participationFixture), { status: 200 });
      },
    });
    expect(participation.participation).toEqual({ all: [1, 2], owner: [1, 0] });

    const paths = await listRepoTrafficPopularPaths({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/traffic/popular/paths");
        return new Response(JSON.stringify(pathsFixture), { status: 200 });
      },
    });
    expect(paths.paths).toEqual([{ path: "/README.md", title: "README", count: 4, uniques: 2 }]);

    const referrers = await listRepoTrafficPopularReferrers({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/traffic/popular/referrers");
        return new Response(JSON.stringify(referrersFixture), { status: 200 });
      },
    });
    expect(referrers.referrers).toEqual([{ referrer: "google.com", count: 3, uniques: 2 }]);
  });

  test("202 is not a successful empty body and is not retried", async () => {
    let calls = 0;
    await expect(listRepoStatsContributors({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async () => {
        calls += 1;
        return new Response("", { status: 202 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub result is not ready." });
    expect(calls).toBe(1);

    calls = 0;
    await expect(listRepoStatsCommitActivity({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async () => {
        calls += 1;
        return new Response("[]", { status: 202 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(calls).toBe(1);
  });

  test("404 stays an upstream error", async () => {
    await expect(getRepoTrafficViews({
      accessToken: "t", owner: "missing", repo: "app",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub repository was not found." });
  });

  test("validation-only path does not fetch", () => {
    const result = getRepoStatsParticipation({ owner: "acme", repo: "app" });
    expect(result.action).toBe("repos.stats.participation.get");
    expect(result.validated).toEqual({ owner: "acme", repo: "app" });
  });
});
