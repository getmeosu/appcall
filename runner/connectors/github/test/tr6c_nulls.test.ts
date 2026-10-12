import { describe, expect, test } from "bun:test";
import { normalizeDiscussionComment } from "../src/discussions";

// TR-6c (v0.89.9, +0 ops): DiscussionComment.author (Actor) and replyTo (DiscussionComment) are
// nullable in GraphQL (octokit/graphql-schema@82ff2d4780080e6929ebb95608cefa22dfa05ac7). A missing
// author (deleted user) or a top-level comment (no replyTo) is null, not ''. Fails on v0.89.8 (TR-6b 4457f37f).

describe("TR-6c: discussion comment author / replyTo nullability", () => {
  test("missing author and replyTo -> null", () => {
    const c = normalizeDiscussionComment({ id: "DC_1", body: "b", url: "u", author: null, replyTo: null, createdAt: "t", updatedAt: "t" });
    expect([c.author, c.replyToId]).toEqual([null, null]);
    expect(c.body).toBe("b");
  });

  test("present values pass through", () => {
    const c = normalizeDiscussionComment({ id: "DC_2", author: { login: "octo" }, replyTo: { id: "DC_1" } });
    expect([c.author, c.replyToId]).toEqual(["octo", "DC_1"]);
  });
});
