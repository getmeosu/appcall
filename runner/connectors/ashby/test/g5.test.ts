import { describe, expect, test } from "bun:test";
import {
  executeCandidatesAddProject,
  executeCandidatesListProjects,
  executeProjectsList,
  executeProjectsSearch,
} from "../src/g5";
import candidateProjectAdded from "../fixtures/candidate_project_added.json";
import candidateProjectsList from "../fixtures/candidate_projects_list.json";
import projectsList from "../fixtures/projects_list.json";
import projectsSearch from "../fixtures/projects_search.json";

function stubFetch(body: string, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey" };
const CANDIDATE = "e9ed20fd-d45f-4aad-8a00-a19bfba0083e";
const PROJECT = "bcffca12-5b09-4a76-acf2-00a8e267b222";

describe("Ashby G5 candidates.add_project", () => {
  test("POSTs /candidate.addProject with candidateId + projectId and returns the candidate", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateProjectAdded));
    const result = await executeCandidatesAddProject({
      ...auth,
      candidateId: CANDIDATE,
      projectId: PROJECT,
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(new URL(calls[0]!.url).pathname).toBe("/candidate.addProject");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      candidateId: CANDIDATE,
      projectId: PROJECT,
    });
    // Live shape: results is the Candidate object (no projects field on Candidate).
    expect(result.candidate.id).toBe(CANDIDATE);
    expect(result.candidate.name).toBe("Adam Hart");
    expect((result.candidate.primaryEmailAddress as { value?: string }).value).toBe(
      "adam@example.com",
    );
    expect("projects" in result.candidate).toBe(false);
  });

  test("rejects missing candidateId / projectId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeCandidatesAddProject({ ...auth, candidateId: "", projectId: PROJECT, fetch: impl }),
    ).rejects.toThrow(/candidateId/);
    await expect(
      executeCandidatesAddProject({ ...auth, candidateId: CANDIDATE, projectId: "", fetch: impl }),
    ).rejects.toThrow(/projectId/);
    expect(calls).toHaveLength(0);
  });

  test("throws when the response has no results object", async () => {
    const { impl } = stubFetch(JSON.stringify({ success: true }));
    await expect(
      executeCandidatesAddProject({ ...auth, candidateId: CANDIDATE, projectId: PROJECT, fetch: impl }),
    ).rejects.toThrow(/missing results object/);
  });
});

describe("Ashby G5 project reads", () => {
  test("candidates.list_projects POSTs /candidate.listProjects with candidateId/limit/cursor only", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateProjectsList));
    const result = await executeCandidatesListProjects({
      ...auth,
      candidateId: CANDIDATE,
      limit: 50,
      cursor: "cand-proj-cursor-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/candidate.listProjects");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      candidateId: CANDIDATE,
      limit: 50,
      cursor: "cand-proj-cursor-1",
    });
    expect(result.projects).toHaveLength(2);
    const [active, archived] = result.projects;
    // Live nesting: title / isArchived / customFieldEntries at the row's top level.
    expect(active!.title).toBe("Senior Engineers");
    expect(active!.isArchived).toBe(false);
    expect(
      (active!.customFieldEntries as Array<{ valueLabel?: string }>)[0]!.valueLabel,
    ).toBe("EMEA");
    expect(archived!.isArchived).toBe(true);
    expect(archived!.authorId).toBeNull();
    expect(archived!.customFieldEntries).toBeNull();
    expect(result.moreDataAvailable).toBe(true);
    expect(result.nextCursor).toBe("cand-proj-cursor-2");
    expect(result.syncToken).toBeNull();
  });

  test("candidates.list_projects rejects missing candidateId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeCandidatesListProjects({ ...auth, candidateId: "", fetch: impl }),
    ).rejects.toThrow(/candidateId/);
    expect(calls).toHaveLength(0);
  });

  test("projects.list POSTs /project.list with integer createdAfter and paging", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(projectsList));
    const result = await executeProjectsList({
      ...auth,
      createdAfter: 1704067200000,
      limit: 100,
      syncToken: "prior-sync",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/project.list");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      createdAfter: 1704067200000,
      limit: 100,
      syncToken: "prior-sync",
    });
    expect(result.projects.map((p) => p.title)).toEqual(["My Project", "Senior Engineers"]);
    expect(result.projects[1]!.descriptionPlain).toBeNull();
    expect(result.moreDataAvailable).toBe(false);
    expect(result.syncToken).toBe("sync-token-example");
    expect(result.nextCursor).toBeNull();
  });

  test("projects.list sends {} with no filters and rejects non-integer createdAfter", async () => {
    const empty = stubFetch(JSON.stringify(projectsList));
    await executeProjectsList({ ...auth, fetch: empty.impl });
    expect(JSON.parse(await empty.calls[0]!.text())).toEqual({});

    const bad = stubFetch("{}");
    await expect(
      executeProjectsList({
        ...auth,
        createdAfter: "2024-01-01" as unknown as number,
        fetch: bad.impl,
      }),
    ).rejects.toThrow(/createdAfter/);
    expect(bad.calls).toHaveLength(0);
  });

  test("projects.search POSTs /project.search with title", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(projectsSearch));
    const result = await executeProjectsSearch({ ...auth, title: "My Project", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/project.search");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ title: "My Project" });
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]!.title).toBe("My Project");
    expect(result.projects[0]!.confidential).toBe(false);
  });

  test("projects.search rejects empty title before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeProjectsSearch({ ...auth, title: "", fetch: impl })).rejects.toThrow(
      /title/,
    );
    expect(calls).toHaveLength(0);
  });

  test("list normalizers return [] when results is not an array", async () => {
    const { impl } = stubFetch(JSON.stringify({ success: true, results: null }));
    const result = await executeProjectsList({ ...auth, fetch: impl });
    expect(result.projects).toEqual([]);
  });
});
