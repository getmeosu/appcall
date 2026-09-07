import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/block_children.json";
import { normalizeBlock, parseNextCursor } from "../src/blocks";

describe("notion block model", () => {
  test("normalizes Notion block children", () => {
    expect(fixture.results.map((block) => normalizeBlock(block))).toEqual([{
      id: "notion:44444444-4444-4444-4444-444444444444",
      provider: "notion",
      providerBlockId: "44444444-4444-4444-4444-444444444444",
      blockType: "paragraph",
      text: "Build appcall connectors faster.",
      hasChildren: true,
      children: undefined,
      modelVersion: "2026-05-14",
      raw: fixture.results[0],
    }]);
  });

  test("parses Notion block pagination cursor", () => {
    expect(parseNextCursor(fixture)).toBe("next-block-cursor");
    expect(parseNextCursor({ object: "list", next_cursor: null })).toBeNull();
  });

  test("rejects malformed block objects", () => {
    expect(() => normalizeBlock({ object: "block", type: "paragraph" })).toThrow("block.id is required");
  });
});
