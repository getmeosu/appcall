import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c-2: the multipart upload handlers interpolate session_id into
// /v1/sessions/{session_id}/... with encodeURIComponent, which leaves "." and ".."
// intact (POST /v1/sessions/../uploads -> /v1/uploads). Blank, whitespace,
// dot-only and %2e forms are now rejected before the body is built or sent.
const FILE = { file: { name: "a.txt", contentBase64: "aGVsbG8=" } };
const BAD = ["", " ", "  ", "\t", ".", "..", " . ", "%2e", "%2e%2e", "%2E%2E", ".%2e", "a/b", "%2f"];

describe("anchor-browser SEC-PATH-2c-2 upload session_id", () => {
  for (const [op, suffix] of [["sessions.uploads.create", "uploads"], ["sessions.agent.files.upload", "agent/files"]]) {
    test(`${op} sends a valid session_id in the path`, async () => {
      const result = await outcomeOf("anchor-browser", op, { apiKey: "k", session_id: "sess-123", ...FILE });
      expect(result.calls.map((c) => new URL(c.url).pathname)).toEqual([`/v1/sessions/sess-123/${suffix}`]);
    });
    test(`${op} rejects blank, whitespace, dot-only and %2e session_id with 0 fetches`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("anchor-browser", op, { apiKey: "k", session_id: value, ...FILE });
        expect(result.calls, `${op} session_id=${JSON.stringify(value)}`).toEqual([]);
        expect(result.ok).toBe(false);
        expect(result.code, `${op} session_id=${JSON.stringify(value)}`).toBe("INVALID_ACTION_INPUT");
      }
    });
  }
});
