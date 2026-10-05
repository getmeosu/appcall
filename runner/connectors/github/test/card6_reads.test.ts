import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import codeOfConduct from "../fixtures/code_of_conduct.json";
import assignees from "../fixtures/repo_assignees.json";
import publicEvents from "../fixtures/public_events.json";
import { getCodeOfConduct, listRepoAssignees, listPublicEvents } from "../src/actions";
import { validateGetCodeOfConductInput, validateListRepoAssigneesInput, validateListPublicEventFeedInput } from "../src/card6_reads";

const READS = ["codes_of_conduct.get", "repos.assignees.list", "events.public.list"] as const;

const CHECK_DESCRIPTION = "GET /repos/{owner}/{repo}/assignees/{assignee}. A 204 means the user is an assignee (assigned true). A 404 means they are not (assigned false). Neither is CONNECTOR_UPSTREAM_ERROR.";

describe("github card-6 reads", () => {
  test("version stays 0.50.0 at 516 ops and the new reads omit effect policy", () => {
    expect(manifest.version).toBe("0.50.0");
    expect(Object.keys(manifest.operations).length).toBe(516);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    expect(manifest.operations["codes_of_conduct.get"].description).toContain("GET /codes_of_conduct/{key}");
    expect(manifest.operations["repos.assignees.list"].description).toContain("GET /repos/{owner}/{repo}/assignees");
    expect(manifest.operations["events.public.list"].description).toContain("GET /events");
    const check = manifest.operations["repos.assignees.check"] as Record<string, unknown>;
    expect(check).toBeDefined();
    expect(check.sideEffect).toBe("read");
    expect(check.description).toBe(CHECK_DESCRIPTION);
    expect(check.effectPolicy).toBeUndefined();
    expect(check.reconcile).toBeUndefined();
  });

  test("key is required and list inputs stay single-segment", () => {
    expect(validateGetCodeOfConductInput({ key: "citizen_code_of_conduct" }).key).toBe("citizen_code_of_conduct");
    expect(() => validateGetCodeOfConductInput({})).toThrow(/key is required/);
    expect(() => validateGetCodeOfConductInput({ key: "a/b" })).toThrow(/single path segment/);
    expect(validateListRepoAssigneesInput({ owner: "acme", repo: "app", perPage: 5, page: 2 })).toEqual({
      owner: "acme", repo: "app", perPage: 5, page: 2,
    });
    expect(validateListPublicEventFeedInput(undefined)).toEqual({});
    expect(() => validateListPublicEventFeedInput({ perPage: 101 })).toThrow(/perPage/);
  });

  test("200 bodies map and 404 stays upstream on the exact paths", async () => {
    const calls: string[] = [];
    const conduct = await getCodeOfConduct({
      accessToken: "t", key: "my key",
      fetch: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify(codeOfConduct), { status: 200 });
      },
    });
    expect(calls).toEqual(["https://api.github.com/codes_of_conduct/my%20key"]);
    expect((conduct.codeOfConduct as Record<string, unknown>).key).toBe("citizen_code_of_conduct");
    expect((conduct.codeOfConduct as Record<string, unknown>).htmlUrl).toContain("code-of-conduct");
    await expect(getCodeOfConduct({
      accessToken: "t", key: "missing",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    calls.length = 0;
    const listed = await listRepoAssignees({
      accessToken: "t", owner: "acme", repo: "app", perPage: 5,
      fetch: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify(assignees), { status: 200 });
      },
    });
    expect(calls).toEqual(["https://api.github.com/repos/acme/app/assignees?per_page=5"]);
    expect((listed.assignees as Array<Record<string, unknown>>)[0].login).toBe("octo");
    await expect(listRepoAssignees({
      accessToken: "t", owner: "acme", repo: "missing",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    calls.length = 0;
    const events = await listPublicEvents({
      accessToken: "t", page: 2,
      fetch: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify(publicEvents), { status: 200 });
      },
    });
    expect(calls).toEqual(["https://api.github.com/events?page=2"]);
    expect((events.events as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: "99", type: "PushEvent", actor: "octo", repo: "acme/app", public: true,
    });
    await expect(listPublicEvents({
      accessToken: "t",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
