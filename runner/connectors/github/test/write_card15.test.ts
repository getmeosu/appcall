import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  createSecurityAdvisoryReport,
  createSecurityAdvisoryFork,
  createRepoKey,
  deleteRepoKey,
  createRepoRuleset,
  deleteRepoRuleset,
  updateRepoRuleset,
} from "../src/actions";

const PATHS = {
  "repos.security_advisories.reports.create": "POST /repos/{owner}/{repo}/security-advisories/reports",
  "repos.security_advisories.forks.create": "POST /repos/{owner}/{repo}/security-advisories/{ghsa_id}/forks",
  "repos.keys.create": "POST /repos/{owner}/{repo}/keys",
  "repos.keys.delete": "DELETE /repos/{owner}/{repo}/keys/{key_id}",
  "repos.rulesets.create": "POST /repos/{owner}/{repo}/rulesets",
  "repos.rulesets.delete": "DELETE /repos/{owner}/{repo}/rulesets/{ruleset_id}",
  "repos.rulesets.update": "PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}",
} as const;

const OMIT = [
  "repos.security_advisories.reports.create",
  "repos.security_advisories.forks.create",
  "repos.keys.create",
  "repos.keys.delete",
  "repos.rulesets.create",
  "repos.rulesets.delete",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("github write card 15 advisories keys rulesets writes", () => {
  test("version is 0.77.0 at 797 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.77.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(797);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const op of Object.values(ops)) {
      kinds[op.kind as keyof typeof kinds] += 1;
      if (op.kind === "action") {
        if (op.sideEffect === "read") side.read += 1;
        else if (op.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 747, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 396, write: 336, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
    for (const key of OMIT) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    expect(ops["repos.rulesets.update"].effectPolicy).toBe("Reconcile");
    expect(ops["repos.rulesets.update"].reconcile).toBe("repos.rulesets.get");
    expect(ops["repos.rulesets.update"].effect).toBeUndefined();
    expect(String(ops["repos.rulesets.get"].description)).toContain(
      "GET /repos/{owner}/{repo}/rulesets/{ruleset_id}",
    );
    expect(ops["repos.security_advisories.forks.create"].inputSchema.properties.ghsa_id).toBeDefined();
    expect(ops["repos.keys.delete"].inputSchema.properties.keyId).toBeDefined();
    expect(ops["repos.rulesets.delete"].inputSchema.properties.rulesetId).toBeDefined();
    expect(ops["repos.rulesets.update"].inputSchema.properties.rulesetId).toBeDefined();
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return json(status, body);
    };

    const advisory = { ghsa_id: "GHSA-xxxx-yyyy-zzzz", summary: "x" };
    const reported = await createSecurityAdvisoryReport({
      accessToken: token,
      owner: "acme",
      repo: "app",
      summary: "title",
      description: "body",
      fetch: fetchOf(201, advisory),
    });
    expect(reported.advisory).toEqual(advisory);
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/security-advisories/reports");

    const fork = { full_name: "acme/app-ghsa" };
    const forked = await createSecurityAdvisoryFork({
      accessToken: token,
      owner: "acme",
      repo: "app",
      ghsa_id: "GHSA-abcd-efgh-ijkl",
      fetch: fetchOf(202, fork),
    });
    expect(forked.fork).toEqual(fork);
    expect(calls.at(-1)).toContain(
      "POST https://api.github.com/repos/acme/app/security-advisories/GHSA-abcd-efgh-ijkl/forks",
    );

    const key = { id: 7, key: "ssh-ed25519 AAAA", title: "ci" };
    const createdKey = await createRepoKey({
      accessToken: token,
      owner: "acme",
      repo: "app",
      key: "ssh-ed25519 AAAA",
      title: "ci",
      readOnly: true,
      fetch: fetchOf(201, key),
    });
    expect(createdKey.key).toEqual(key);
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/keys");
    expect(calls.at(-1)).toContain(JSON.stringify({ key: "ssh-ed25519 AAAA", title: "ci", read_only: true }));

    const deletedKey = await deleteRepoKey({
      accessToken: token, owner: "acme", repo: "app", keyId: 7, fetch: fetchOf(204),
    });
    expect(deletedKey).toMatchObject({ action: "repos.keys.delete", deleted: true, keyId: 7 });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/keys/7");

    const ruleset = { id: 3, name: "default", enforcement: "active" };
    const createdRuleset = await createRepoRuleset({
      accessToken: token,
      owner: "acme",
      repo: "app",
      name: "default",
      enforcement: "active",
      target: "branch",
      fetch: fetchOf(201, ruleset),
    });
    expect(createdRuleset.ruleset).toEqual(ruleset);
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/rulesets");

    const deletedRuleset = await deleteRepoRuleset({
      accessToken: token, owner: "acme", repo: "app", rulesetId: 3, fetch: fetchOf(204),
    });
    expect(deletedRuleset).toMatchObject({ action: "repos.rulesets.delete", deleted: true, rulesetId: 3 });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/rulesets/3");

    const updated = { id: 3, name: "default", enforcement: "evaluate" };
    const updatedRuleset = await updateRepoRuleset({
      accessToken: token,
      owner: "acme",
      repo: "app",
      rulesetId: 3,
      enforcement: "evaluate",
      fetch: fetchOf(200, updated),
    });
    expect(updatedRuleset.ruleset).toEqual(updated);
    expect(calls.at(-1)).toContain("PUT https://api.github.com/repos/acme/app/rulesets/3");

    await expect(deleteRepoKey({
      accessToken: token, owner: "acme", repo: "app", keyId: 99, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteRepoRuleset({
      accessToken: token, owner: "acme", repo: "app", rulesetId: 99, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation rejects bad input without a token", () => {
    expect(() => createSecurityAdvisoryReport({ owner: "acme", repo: "app", summary: "x" } as never)).toThrow();
    expect(() => createSecurityAdvisoryFork({ owner: "acme", repo: "app", ghsa_id: "bad" } as never)).toThrow();
    expect(() => createRepoKey({ owner: "acme", repo: "app" } as never)).toThrow();
    expect(() => createRepoRuleset({ owner: "acme", repo: "app", name: "x" } as never)).toThrow();
    expect(deleteRepoKey({ owner: "acme", repo: "app", keyId: 1 })).toMatchObject({
      action: "repos.keys.delete", validated: { owner: "acme", repo: "app", keyId: 1 },
    });
    expect(updateRepoRuleset({ owner: "acme", repo: "app", rulesetId: 1, name: "n" })).toMatchObject({
      action: "repos.rulesets.update",
      validated: { owner: "acme", repo: "app", rulesetId: 1, name: "n" },
    });
  });
});
