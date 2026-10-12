import { describe, expect, it } from "bun:test";
import { updateAllocation, updateProject } from "../src/actions";

// SEC-PATH-2: project and allocation ids are positive-integer validated; the
// shared guard runs before the path is built as defence in depth.
function recorder() {
  const calls: string[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ project_id: 42, task_id: 7 }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch };
}

describe("float path segment guard", () => {
  it("rejects '.' and '..' ids with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      await expect(Promise.resolve().then(() => updateProject({ apiKey: "k", projectId: bad, name: "n", fetch }))).rejects.toBeDefined();
      await expect(Promise.resolve().then(() => updateAllocation({ apiKey: "k", allocationId: bad, hours: 1, fetch }))).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("keeps valid numeric ids", async () => {
    const { calls, fetch } = recorder();
    await Promise.resolve().then(() => updateProject({ apiKey: "k", projectId: 42, name: "n", fetch })).catch(() => undefined);
    await Promise.resolve().then(() => updateAllocation({ apiKey: "k", allocationId: 7, hours: 1, fetch })).catch(() => undefined);
    expect(calls.map((url) => new URL(url).pathname)).toEqual(["/v3/projects/42", "/v3/tasks/7"]);
  });
});
