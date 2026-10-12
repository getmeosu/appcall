import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c-2: campaigns.media.upload interpolates campaign and folder_uuid
// into /v3/campaigns/{campaign}/media/{folder_uuid} with encodeURIComponent,
// which leaves "." and ".." intact. Blank, whitespace, dot-only and %2e forms of
// either are now rejected before any request.
const FILE = { file: { name: "a.png", contentBase64: "aGVsbG8=" } };
const BAD = ["", " ", "  ", "\t", ".", "..", " . ", "%2e", "%2e%2e", "%2E%2E", ".%2e", "a/b", "%2f"];

describe("raisely SEC-PATH-2c-2 campaigns.media.upload", () => {
  test("sends valid ids in the path", async () => {
    const result = await outcomeOf("raisely", "campaigns.media.upload", { apiKey: "k", campaign: "camp-1", folder_uuid: "f-1", ...FILE });
    expect(result.calls.map((c) => new URL(c.url).pathname)).toEqual(["/v3/campaigns/camp-1/media/f-1"]);
  });
  for (const field of ["campaign", "folder_uuid"]) {
    test(`rejects blank, whitespace, dot-only and %2e ${field} with 0 fetches`, async () => {
      for (const value of BAD) {
        const result = await outcomeOf("raisely", "campaigns.media.upload", { apiKey: "k", campaign: "camp-1", folder_uuid: "f-1", ...FILE, [field]: value });
        expect(result.calls, `${field}=${JSON.stringify(value)}`).toEqual([]);
        expect(result.ok).toBe(false);
        expect(result.code, `${field}=${JSON.stringify(value)}`).toBe("INVALID_ACTION_INPUT");
      }
    });
  }
});
