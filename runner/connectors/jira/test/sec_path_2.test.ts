import { describe, expect, it } from "bun:test";
import { getIssue, getProject } from "../src/actions";
import { jiraDepthActions } from "../src/depth";

// SEC-PATH-2: encodeURIComponent leaves "." and ".." intact, so every jira path
// value now passes the shared no-traversal guard before it is encoded. The
// permissive guard is used because Jira keys/ids and Atlassian account ids
// ("557058:f581...") are wider than [A-Za-z0-9._-].
const CLOUD = "11111111-2222-3333-4444-555555555555";

function recorder() {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ id: "1", key: "K-1", fields: {} }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetch };
}

async function rejectsWithoutFetch(run: (fetch: typeof globalThis.fetch) => unknown) {
  const { calls, fetch } = recorder();
  let threw = false;
  try { await run(fetch); } catch (error) { threw = true; expect(String((error as Error).message ?? error)).toMatch(/dot segment/); }
  expect(threw).toBe(true);
  expect(calls).toHaveLength(0);
}

describe("jira path segment guard", () => {
  for (const bad of [".", ".."]) {
    it(`rejects ${JSON.stringify(bad)} in hand-written and depth paths with zero fetches`, async () => {
      await rejectsWithoutFetch((fetch) => getIssue({ accessToken: "t", cloudId: CLOUD, issueKey: bad, fetch }));
      await rejectsWithoutFetch((fetch) => getProject({ accessToken: "t", cloudId: CLOUD, projectKey: bad, fetch }));
      await rejectsWithoutFetch((fetch) => jiraDepthActions["attachments.delete"]!({ accessToken: "t", cloudId: CLOUD, attachmentId: bad, fetch }));
      await rejectsWithoutFetch((fetch) => jiraDepthActions["projects.roles.actors.add"]!({ accessToken: "t", cloudId: CLOUD, projectKey: "PROJ", roleId: bad, fetch }));
      await rejectsWithoutFetch((fetch) => getIssue({ accessToken: "t", cloudId: bad, issueKey: "K-1", fetch }));
    });
  }

  it("keeps ids with characters outside the strict charset, percent-encoded", async () => {
    const { calls, fetch } = recorder();
    await jiraDepthActions["attachments.delete"]!({ accessToken: "t", cloudId: CLOUD, attachmentId: "557058:f5+8=", fetch });
    await getIssue({ accessToken: "t", cloudId: CLOUD, issueKey: "PROJ-123", fetch });
    expect(calls.map((url) => new URL(url).pathname)).toEqual([
      `/ex/jira/${CLOUD}/rest/api/3/attachment/557058%3Af5%2B8%3D`,
      `/ex/jira/${CLOUD}/rest/api/3/issue/PROJ-123`,
    ]);
  });
});
