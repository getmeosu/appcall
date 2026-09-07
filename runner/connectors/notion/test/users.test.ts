import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/users.json";
import { normalizeUser, parseNextCursor } from "../src/users";

describe("notion user model", () => {
  test("normalizes person and bot users from a Notion fixture", () => {
    expect(fixture.results.map((user) => normalizeUser(user))).toEqual([
      {
        id: "notion:11111111-1111-1111-1111-111111111111",
        provider: "notion",
        providerUserId: "11111111-1111-1111-1111-111111111111",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        avatarUrl: "https://example.com/ada.png",
        userType: "person",
        modelVersion: "2026-05-14",
        raw: fixture.results[0],
      },
      {
        id: "notion:22222222-2222-2222-2222-222222222222",
        provider: "notion",
        providerUserId: "22222222-2222-2222-2222-222222222222",
        displayName: "Appcall Bot",
        email: null,
        avatarUrl: null,
        userType: "bot",
        modelVersion: "2026-05-14",
        raw: fixture.results[1],
      },
    ]);
  });

  test("parses Notion pagination cursor", () => {
    expect(parseNextCursor(fixture)).toBe("next-user-cursor");
    expect(parseNextCursor({ object: "list", next_cursor: null })).toBeNull();
  });

  test("rejects malformed user objects", () => {
    expect(() => normalizeUser({ object: "user", name: "missing id" })).toThrow("user.id is required");
  });
});
