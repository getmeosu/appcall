import { describe, expect, it } from "bun:test";
import contactsListFixture from "../fixtures/contacts_list.json";
import { listContacts, validateContactsListInput } from "../src/contacts";

describe("contacts.list segment scope", () => {
  it("accepts either a segment ID or the legacy audience ID", () => {
    expect(validateContactsListInput({ segmentId: "segment-id" }).segmentId).toBe("segment-id");
    expect(validateContactsListInput({ audienceId: "audience-id" }).audienceId).toBe("audience-id");
  });

  it("rejects ambiguous scopes and unsafe path identifiers", () => {
    expect(() => validateContactsListInput({ segmentId: "segment-id", audienceId: "audience-id" }))
      .toThrow("provide either segmentId or audienceId, not both");
    for (const segmentId of [".", "..", "segment/id", "segment\\id", "segment\u0000id"]) {
      expect(() => validateContactsListInput({ segmentId }))
        .toThrow("segmentId must be a safe path identifier");
    }
  });

  it("uses segment contact listing for segmentId and legacy audienceId", async () => {
    for (const [scopeField, scopeId] of [["segmentId", "segment-id"], ["audienceId", "audience-id"]] as const) {
      let capturedUrl = "";
      const result = await listContacts({
        apiKey: "re_test",
        [scopeField]: scopeId,
        limit: 25,
        before: "cursor/previous",
        fetch: async (input) => {
          capturedUrl = String(input);
          return Response.json(contactsListFixture, { status: 200 });
        },
      }) as Record<string, any>;
      expect(capturedUrl).toBe(`https://api.resend.com/segments/${scopeId}/contacts?limit=25&before=cursor%2Fprevious`);
      expect(result.source).toBe("provider");
      expect(result.contacts).toHaveLength(2);
    }
  });
});
