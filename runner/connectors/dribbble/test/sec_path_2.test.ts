import { describe, expect, it } from "bun:test";
import { createAttachment } from "../src/actions";

// SEC-PATH-2: createAttachment interpolates shotId into the path. shotId is
// already positive-integer validated; the shared guard is defence in depth.
// (No manifest op dispatches createAttachment today.)
function recorder() {
  const calls: string[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response("", { status: 202, headers: { location: "https://api.dribbble.com/v2/shots/123/attachments/9" } });
  };
  return { calls, fetch };
}

describe("dribbble path segment guard", () => {
  it("rejects '.' and '..' as shotId with zero fetches", async () => {
    for (const bad of [".", ".."]) {
      const { calls, fetch } = recorder();
      await expect(createAttachment({ accessToken: "t", shotId: bad, file: "aGVsbG8=", fetch })).rejects.toBeDefined();
      expect(calls).toHaveLength(0);
    }
  });

  it("keeps a valid shotId", async () => {
    const { calls, fetch } = recorder();
    await createAttachment({ accessToken: "t", shotId: 123, file: "aGVsbG8=", fetch }).catch(() => undefined);
    expect(calls.map((url) => new URL(url).pathname)).toEqual(["/v2/shots/123/attachments"]);
  });
});
