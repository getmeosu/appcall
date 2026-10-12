import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

// FIX-G12C / FIX-G13C: the 12 G12 and 10 G13 GraphQL ops left this declarative list; they run via src/gap_g12c.ts / src/gap_g13c.ts (test/g12c.test.ts, test/g13c.test.ts).
// PRUNE-2 (0.83.0): rest.teams.list_members_legacy left it (legacy GET /teams/{team_id}/members, closing-down notice
// https://docs.github.com/rest/teams/members#list-team-members-legacy); teams.members.list is the org-scoped route.
// PRUNE-3 (0.84.0): the 4 Source Imports rest.migrations.* ops left it (API retired 2024-04-12,
// https://github.blog/changelog/2023-10-11-deprecation-source-imports-rest-api/).
// PRUNE-4 (0.85.0): the 11 second-auth rest.apps.* ops (Basic client_id:secret, app JWT, installation token or
// GitHub App user token only) and the 3 GitHub Models rest.x.* ops (CHAT/EMBED/MODELS; retired 2026-07-30,
// https://github.blog/changelog/2026-07-30-github-models-is-now-retired/) left it; models.github.ai left allowedHosts.
// PRUNE-5 (0.86.0): the 6 rest.orgs.*pat* fine-grained-PAT admin ops left it ("Only GitHub Apps can use this
// endpoint", https://docs.github.com/rest/orgs/personal-access-tokens; rest-api-description main @ 58b1e0c0).
// FIX-G14C: the 5 GHEC rest.x.* ops (AUDIT, ORG_ROLE_*, ORG_FINE_PERMS) left it too; they run via src/gap_g14c.ts (test/g14c.test.ts).
const ADDED = [
  "graphql.discussions.comments.delete",
  "graphql.discussions.delete",
  "rest.issues.add_blocked_by_dependency",
  "rest.issues.get_parent",
  "rest.orgs.list_issue_types",
  "rest.packages.list_docker_migration_conflicting_packages_for_user"
] as const;

describe("github full-depth REST additions", () => {
  test("version and runnable request blocks", () => {
    expect(manifest.version).toBe("0.86.10");
    expect(Object.keys(manifest.operations)).toHaveLength(847);
    expect(manifest.network.allowedHosts).not.toContain("models.github.ai");
    for (const key of ADDED) {
      const op = manifest.operations[key] as Record<string, any>;
      expect(op.kind, key).toBe("action");
      expect(op.request.method, key).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      expect(op.request.path.startsWith("/"), key).toBe(true);
      expect(op.request.baseUrl.startsWith("https://"), key).toBe(true);
      expect(op.maxResponseBytes >= op.maxInputBytes, key).toBe(true);
      expect(op.inputSchema.type, key).toBe("object");
      expect(op.title.length > 0, key).toBe(true);
      const method = op.request.method as string;
      if (method === "GET") {
        expect(op.request.body, key).toBeUndefined();
        expect(op.sideEffect, key).toBe("read");
      }
      if (method === "DELETE" && op.request.body !== undefined) {
        expect(String(op.description), key).toContain("DELETE");
      }
      const headers = op.request.headers as Record<string, string>;
      if (op.request.body === undefined) {
        expect(headers["Content-Type"], key).toBeUndefined();
      } else {
        expect(headers["Content-Type"], key).toBe("application/json");
      }
    }
    for (const spec of Object.values(manifest.operations)) {
      const op = spec as Record<string, any>;
      if (op.kind === "webhook") expect(op.sideEffect).toBe("read");
      expect(op.maxResponseBytes >= op.maxInputBytes).toBe(true);
    }
  });

  test("PRUNE-2/3: the legacy team-members route is gone; its Composio slug maps to the documented replacement", () => {
    const ops = manifest.operations as Record<string, unknown>;
    expect(ops["rest.teams.list_members_legacy"]).toBeUndefined();
    expect(ops["teams.members.list"]).toBeDefined();
    const mapped = coverage.mapped as Record<string, string>;
    // linus (PRUNE-3): map to teams.members.list (GET /orgs/{org}/teams/{team_slug}/members), not missing_still.
    expect(mapped.GITHUB_GET_TEAM_MEMBERS).toBe("teams.members.list");
    expect((coverage.missing_still as Array<{ slug: string }>).map((m) => m.slug)).not.toContain("GITHUB_GET_TEAM_MEMBERS");
    expect(coverage.added as string[]).not.toContain("rest.teams.list_members_legacy");
  });

  test("every live Composio tool is mapped or recorded as non-REST", () => {
    const mapped = coverage.mapped as Record<string, string>;
    const missing = coverage.missing_still as Array<{ slug: string; reason: string }>;
    expect(Object.keys(mapped).length + missing.length).toBe(897);
    for (const reason of missing) {
      expect(reason.reason.length > 0).toBe(true);
      expect(reason.reason.toLowerCase()).not.toContain("todo");
    }
    for (const key of Object.values(mapped)) {
      expect(manifest.operations[key], key).toBeDefined();
    }
  });

  test("added operations perform the documented HTTP call", async () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    for (const key of ADDED) {
      const op = manifest.operations[key] as Record<string, any>;
      const fixture = (await import(`../fixtures/cases/${key.replaceAll(".", "_")}.json`)).default as {
        input: Record<string, unknown>;
        request: { method: string; url: string; body: string | null };
        response: { status: number; body: unknown };
      };
      expect(fixture.request.body === null || typeof fixture.request.body === "string", key).toBe(true);
      const calls: Array<{ url: string; method: string; body: string | undefined }> = [];
      const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
        const status = fixture.response.status;
        const empty = status === 204 || status === 302;
        return new Response(empty ? null : JSON.stringify(fixture.response.body), {
          status,
          headers: status === 302 ? { location: "https://codeload.github.com/artifact" } : { "content-type": "application/json" },
        });
      };
      const token = op.request.headers.Authorization.startsWith("Basic ")
        ? { basicToken: "Y2xpZW50OnNlY3JldA==" }
        : { accessToken: "fixture-token" };
      const result = await compiled.actions[key]!({ ...token, ...fixture.input, fetch: fetchFn }) as Record<string, unknown>;
      expect(calls, key).toHaveLength(1);
      expect(calls[0]!.method, key).toBe(fixture.request.method);
      expect(calls[0]!.url, key).toBe(fixture.request.url);
      expect(calls[0]!.body ?? null, key).toBe(fixture.request.body);
      expect(result.action, key).toBe(key);
      expect(result.source, key).toBe("provider");
    }
  });
});
