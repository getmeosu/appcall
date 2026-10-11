import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

// FIX-G12C / FIX-G13C: the 12 G12 and 10 G13 GraphQL ops left this declarative list; they run via src/gap_g12c.ts / src/gap_g13c.ts (test/g12c.test.ts, test/g13c.test.ts).
// FIX-G14C: the 5 GHEC rest.x.* ops (AUDIT, ORG_ROLE_*, ORG_FINE_PERMS) left it too; they run via src/gap_g14c.ts (test/g14c.test.ts).
const ADDED = [
  "graphql.discussions.comments.delete",
  "graphql.discussions.delete",
  "rest.apps.check_token",
  "rest.apps.create_from_manifest",
  "rest.apps.delete_authorization",
  "rest.apps.delete_token",
  "rest.apps.list_installation_repos_for_authenticated_user",
  "rest.apps.list_installation_requests_for_authenticated_app",
  "rest.apps.list_installations_for_authenticated_user",
  "rest.apps.list_repos_accessible_to_installation",
  "rest.apps.reset_token",
  "rest.apps.revoke_installation_access_token",
  "rest.apps.scope_token",
  "rest.issues.add_blocked_by_dependency",
  "rest.issues.get_parent",
  "rest.migrations.get_commit_authors",
  "rest.migrations.get_large_files",
  "rest.migrations.map_commit_author",
  "rest.migrations.set_lfs_preference",
  "rest.orgs.list_issue_types",
  "rest.orgs.list_pat_grant_requests",
  "rest.orgs.list_pat_grants",
  "rest.orgs.review_pat_grant_request",
  "rest.orgs.review_pat_grant_requests_in_bulk",
  "rest.orgs.update_pat_access",
  "rest.orgs.update_pat_accesses",
  "rest.packages.list_docker_migration_conflicting_packages_for_user",
  "rest.teams.list_members_legacy",
  "rest.x.CHAT",
  "rest.x.EMBED",
  "rest.x.MODELS"
] as const;

describe("github full-depth REST additions", () => {
  test("version and runnable request blocks", () => {
    expect(manifest.version).toBe("0.81.0");
    expect(Object.keys(manifest.operations)).toHaveLength(912);
    expect(manifest.network.allowedHosts).toContain("models.github.ai");
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
