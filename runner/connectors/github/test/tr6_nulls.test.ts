import { describe, expect, test } from "bun:test";
import { normalizeDiscussion, normalizeDiscussionCategory, normalizeDiscussionComment } from "../src/discussions";

// TR-6 (v0.89.7, +0 ops): the 15 GraphQL discussion rows from the TR-5 audit, checked against
// octokit/graphql-schema@82ff2d4780080e6929ebb95608cefa22dfa05ac7 (schema.graphql). Only
// DiscussionCategory.description is nullable (String); every other row is non-null (`!`) and keeps
// its fallback. The assertion on description fails on v0.89.6 (TR-5e 8345f65f).

describe("TR-6: GraphQL discussion nullability", () => {
  test("DiscussionCategory.description (String, nullable) -> null, not ''", () => {
    const c = normalizeDiscussionCategory({ id: "DC_1", name: "Q&A", emoji: ":pray:", description: null, isAnswerable: true });
    expect(c.description).toBeNull();
    expect([c.name, c.emoji, c.isAnswerable]).toEqual(["Q&A", ":pray:", true]);
  });

  test("non-null fields (String!/URI!/DateTime!/Boolean!) keep their fallbacks", () => {
    const c = normalizeDiscussionCategory({});
    expect([c.name, c.emoji, c.isAnswerable]).toEqual(["", "", false]);
    const d = normalizeDiscussion({});
    expect([d.title, d.body, d.url, d.categoryId, d.categoryName, d.createdAt, d.updatedAt]).toEqual(["", "", "", "", "", "", ""]);
    const k = normalizeDiscussionComment({});
    expect([k.body, k.url, k.createdAt, k.updatedAt]).toEqual(["", "", "", ""]);
  });
});
