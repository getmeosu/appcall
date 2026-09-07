import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/search_pages.json";
import { normalizeDocument, parseNextCursor } from "../src/documents";

describe("notion document model", () => {
  test("normalizes Notion search page results", () => {
    expect(fixture.results.map((page) => normalizeDocument(page))).toEqual([{
      id: "notion:33333333-3333-3333-3333-333333333333",
      provider: "notion",
      providerDocumentId: "33333333-3333-3333-3333-333333333333",
      title: "Appcall Plan",
      url: "https://www.notion.so/Appcall-Plan-33333333333333333333333333333333",
      parentType: "workspace",
      createdAt: "2026-05-01T10:00:00.000Z",
      updatedAt: "2026-05-02T10:00:00.000Z",
      trashed: false,
      modelVersion: "2026-05-14",
      raw: fixture.results[0],
    }]);
  });

  test("parses Notion search pagination cursor", () => {
    expect(parseNextCursor(fixture)).toBe("next-page-cursor");
    expect(parseNextCursor({ object: "list", next_cursor: null })).toBeNull();
  });

  test("rejects malformed document objects", () => {
    expect(() => normalizeDocument({ object: "page", properties: {} })).toThrow("page.id is required");
  });
});
