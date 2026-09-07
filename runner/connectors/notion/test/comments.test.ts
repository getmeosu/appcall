import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/comments.json";
import { normalizeComment, parseNextCursor } from "../src/comments";

describe("notion comment model", () => {
  test("normalizes Notion comments", () => {
    expect(fixture.results.map((comment) => normalizeComment(comment))).toEqual([{
      id: "notion:55555555-5555-5555-5555-555555555555",
      provider: "notion",
      providerCommentId: "55555555-5555-5555-5555-555555555555",
      parentId: "33333333-3333-3333-3333-333333333333",
      parentType: "page_id",
      discussionId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      authorId: "11111111-1111-1111-1111-111111111111",
      text: "Looks good for the first customer.",
      createdAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-03T10:05:00.000Z",
      modelVersion: "2026-05-14",
      raw: fixture.results[0],
    }]);
  });

  test("parses Notion comment pagination cursor", () => {
    expect(parseNextCursor(fixture)).toBe("next-comment-cursor");
    expect(parseNextCursor({ object: "list", next_cursor: null })).toBeNull();
  });

  test("rejects malformed comment objects", () => {
    expect(() => normalizeComment({ object: "comment", rich_text: [] })).toThrow("comment.id is required");
  });
});
