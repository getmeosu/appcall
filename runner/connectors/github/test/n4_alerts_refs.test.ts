import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import dependabotFixture from "../fixtures/dependabot_alerts.json";
import codeScanningListFixture from "../fixtures/code_scanning_alerts.json";
import codeScanningFixture from "../fixtures/code_scanning_alert.json";
import secretScanningFixture from "../fixtures/secret_scanning_alerts.json";
import variablesFixture from "../fixtures/actions_variables.json";
import secretsFixture from "../fixtures/actions_secrets.json";
import refsFixture from "../fixtures/git_refs_list.json";
import tagFixture from "../fixtures/git_tag.json";
import {
  listDependabotAlerts,
  listCodeScanningAlerts,
  getCodeScanningAlert,
  updateCodeScanningAlert,
  listSecretScanningAlerts,
  listActionsVariables,
  listActionsSecrets,
  listGitRefs,
  deleteGitRef,
  getGitTag,
  createGitTag,
  deleteGist,
} from "../src/actions";

const N4_READS = [
  "dependabot.alerts.list",
  "code_scanning.alerts.list",
  "code_scanning.alerts.get",
  "secret_scanning.alerts.list",
  "actions.variables.list",
  "git.refs.list",
  "git.tags.get",
  "actions.secrets.list",
] as const;

function schemaKeys(schema: unknown, acc: string[] = []): string[] {
  if (!schema || typeof schema !== "object") return acc;
  const record = schema as { properties?: Record<string, unknown>; items?: unknown };
  if (record.properties) {
    for (const [key, value] of Object.entries(record.properties)) {
      acc.push(key);
      schemaKeys(value, acc);
    }
  }
  if (record.items) schemaKeys(record.items, acc);
  return acc;
}

describe("github N4 alerts refs tags gist delete", () => {
  test("manifest is 0.27.0 with exactly 279 ops and the N4 policies", () => {
    expect(manifest.version).toBe("0.27.0");
    expect(Object.keys(manifest.operations).length).toBe(279);
    for (const key of N4_READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    const update = manifest.operations["code_scanning.alerts.update"] as Record<string, unknown>;
    expect(update.sideEffect).toBe("write");
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("code_scanning.alerts.get");
    const createTag = manifest.operations["git.tags.create"] as Record<string, unknown>;
    expect(createTag.sideEffect).toBe("write");
    expect(createTag.effectPolicy).toBe("Reconcile");
    expect(createTag.reconcile).toBe("git.tags.get");
    for (const key of ["gists.delete", "git.refs.delete"] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
    }
    const secrets = manifest.operations["actions.secrets.list"] as { outputSchema: unknown };
    const keys = schemaKeys(secrets.outputSchema);
    expect(keys).toContain("name");
    expect(keys).toContain("created_at");
    expect(keys).toContain("updated_at");
    expect(keys).toContain("total_count");
    expect(keys).not.toContain("value");
    expect(keys).not.toContain("encrypted_value");
    expect(keys).not.toContain("token");
    expect(manifest.operations["actions.secrets.create"]).toBeUndefined();
    expect(manifest.operations["actions.secrets.update"]).toBeUndefined();
    expect(manifest.operations["actions.secrets.delete"]).toBeUndefined();
    expect(manifest.operations["repos.contents.delete"].effectPolicy).toBe("Idempotent");
  });

  test("dependabot and code scanning lists encode owner and repo", async () => {
    const requests: Request[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      const url = String(input);
      const body = url.includes("dependabot") ? dependabotFixture : codeScanningListFixture;
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const dependabot = await listDependabotAlerts({
      accessToken: "ghp_test",
      owner: "acme?x",
      repo: "app",
      perPage: 10,
      fetch: fetchImpl,
    });
    const scanning = await listCodeScanningAlerts({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      fetch: fetchImpl,
    });
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme%3Fx/app/dependabot/alerts?per_page=10");
    expect(requests[0].headers.get("accept")).toBe("application/vnd.github+json");
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/code-scanning/alerts");
    expect((dependabot.alerts as Record<string, unknown>[])[0].packageName).toBe("lodash");
    expect((scanning.alerts as Record<string, unknown>[])[0].ruleId).toBe("js/unused");
  });

  test("code scanning update patches and get accepts the same alert number", async () => {
    const requests: Request[] = [];
    const updated = await updateCodeScanningAlert({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      alertNumber: 4,
      state: "dismissed",
      dismissedReason: "false positive",
      dismissedComment: "noise",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(codeScanningFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/code-scanning/alerts/4");
    expect(JSON.parse(await requests[0].text())).toEqual({
      state: "dismissed",
      dismissed_reason: "false positive",
      dismissed_comment: "noise",
    });
    expect((updated.alert as Record<string, unknown>).state).toBe("dismissed");
    const dry = getCodeScanningAlert({ owner: "acme", repo: "app", alertNumber: 4, state: "dismissed" });
    expect((dry.validated as Record<string, unknown>).alertNumber).toBe(4);
    const got = await getCodeScanningAlert({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      alertNumber: 4,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(codeScanningFixture), { status: 200 });
      },
    });
    expect(requests[1].method).toBe("GET");
    expect((got.alert as Record<string, unknown>).number).toBe(4);
  });

  test("secret scanning and actions secrets drop secret material", async () => {
    const scanning = await listSecretScanningAlerts({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      fetch: async () => new Response(JSON.stringify(secretScanningFixture), { status: 200 }),
    });
    const encoded = JSON.stringify(scanning);
    expect(encoded).not.toContain("should-not-leak");
    expect((scanning.alerts as Record<string, unknown>[])[0].secretType).toBe("github_personal_access_token");
    expect((scanning.alerts as Record<string, unknown>[])[0].secret).toBeUndefined();
    const requests: Request[] = [];
    const secrets = await listActionsSecrets({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(secretsFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/actions/secrets");
    const secret = (secrets.secrets as Record<string, unknown>[])[0];
    expect(secret).toEqual({
      name: "DEPLOY_TOKEN",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(secret.value).toBeUndefined();
    expect(secret.encrypted_value).toBeUndefined();
    expect(secret.token).toBeUndefined();
    expect(JSON.stringify(secrets)).not.toContain("should-not-leak");
    expect(secrets.total_count).toBe(1);
  });

  test("actions variables list returns names and values", async () => {
    const result = await listActionsVariables({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      fetch: async () => new Response(JSON.stringify(variablesFixture), { status: 200 }),
    });
    expect(result.totalCount).toBe(1);
    expect((result.variables as Record<string, unknown>[])[0]).toEqual({
      name: "REGION",
      value: "us-east-1",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });
  });

  test("git.refs.list uses matching-refs only when a prefix is given", async () => {
    const requests: Request[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return new Response(JSON.stringify(refsFixture), { status: 200 });
    };
    const all = await listGitRefs({ accessToken: "ghp_test", owner: "acme", repo: "app", fetch: fetchImpl });
    const prefixed = await listGitRefs({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      ref: "refs/heads/main",
      fetch: fetchImpl,
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/refs");
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/git/matching-refs/heads/main");
    expect((all.refs as Record<string, unknown>[])[0].sha).toBe("abc123def456abc123def456abc123def456abc1");
    expect((prefixed.refs as Record<string, unknown>[])[0].ref).toBe("refs/heads/main");
  });

  test("git.tags.create posts once and does not send the tag object sha", async () => {
    const requests: Request[] = [];
    const created = await createGitTag({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      tag: "v1.0.0",
      message: "release",
      object: "abc123def456abc123def456abc123def456abc1",
      type: "commit",
      taggerName: "Ada",
      taggerEmail: "ada@example.com",
      taggerDate: "2026-01-01T00:00:00Z",
      sha: "tagsha1234567890tagsha1234567890tagsha12",
      tagSha: "tagsha1234567890tagsha1234567890tagsha12",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(tagFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/tags");
    const body = JSON.parse(await requests[0].text());
    expect(body).toEqual({
      tag: "v1.0.0",
      message: "release",
      object: "abc123def456abc123def456abc123def456abc1",
      type: "commit",
      tagger: { name: "Ada", email: "ada@example.com", date: "2026-01-01T00:00:00Z" },
    });
    expect(body.sha).toBeUndefined();
    expect(body.tagSha).toBeUndefined();
    expect((created.tag as Record<string, unknown>).sha).toBe("tagsha1234567890tagsha1234567890tagsha12");
    const bySha = getGitTag({ owner: "acme", repo: "app", sha: "tagsha1234567890tagsha1234567890tagsha12" });
    expect((bySha.validated as Record<string, unknown>).sha).toBe("tagsha1234567890tagsha1234567890tagsha12");
    const byAlias = getGitTag({ owner: "acme", repo: "app", tagSha: "tagsha1234567890tagsha1234567890tagsha12" });
    expect((byAlias.validated as Record<string, unknown>).sha).toBe("tagsha1234567890tagsha1234567890tagsha12");
    const got = await getGitTag({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      tagSha: "tagsha1234567890tagsha1234567890tagsha12",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(tagFixture), { status: 200 });
      },
    });
    expect(requests[1].method).toBe("GET");
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/git/tags/tagsha1234567890tagsha1234567890tagsha12");
    expect((got.tag as Record<string, unknown>).objectSha).toBe("abc123def456abc123def456abc123def456abc1");
  });

  test("gists.delete and git.refs.delete treat 404 as upstream error", async () => {
    const requests: Request[] = [];
    const deleted = await deleteGist({
      accessToken: "ghp_test",
      gistId: "abc/def",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toBe("https://api.github.com/gists/abc%2Fdef");
    expect(deleted.deleted).toBe(true);
    await expect(deleteGist({
      accessToken: "ghp_test",
      gistId: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Gist not found." });
    const ref = await deleteGitRef({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      ref: "refs/heads/feature",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[1].method).toBe("DELETE");
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/git/refs/heads/feature");
    expect(ref.ref).toBe("heads/feature");
    await expect(deleteGitRef({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      ref: "heads/missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Ref not found." });
  });
});
