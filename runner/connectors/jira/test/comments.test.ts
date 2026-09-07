import { describe, expect, it } from "bun:test";
import { normalizeComment, parseCommentsResponse, normalizeTransition, parseTransitionsResponse } from "../src/comments";
import issueCommentsListFixture from "../fixtures/issue_comments_list.json";
import issueTransitionsListFixture from "../fixtures/issue_transitions_list.json";

describe("normalizeComment", () => {
  const raw = issueCommentsListFixture.comments[0] as any;

  it("maps all comment fields", () => {
    const c = normalizeComment(raw, "PROJ-123");
    expect(c.id).toBe("jira-comment:30001");
    expect(c.provider).toBe("jira");
    expect(c.providerCommentId).toBe("30001");
    expect(c.issueKey).toBe("PROJ-123");
    expect(c.body).toBe("First comment on this issue.");
    expect(c.authorId).toBe("uuid-author-1");
    expect(c.authorName).toBe("Alice Dev");
    expect(c.created).toBe("2025-01-20T10:00:00.000+0000");
    expect(c.updated).toBe("2025-01-20T10:00:00.000+0000");
    expect(c.modelVersion).toBe("2026-05-16");
    expect(c.raw).toBe(raw);
  });

  it("handles missing fields gracefully", () => {
    const c = normalizeComment({}, "PROJ-1");
    expect(c.id).toBe("jira-comment:");
    expect(c.body).toBe("");
    expect(c.authorId).toBe("");
    expect(c.authorName).toBe("");
    expect(c.issueKey).toBe("PROJ-1");
  });
});

describe("parseCommentsResponse", () => {
  it("parses the full comments list fixture", () => {
    const result = parseCommentsResponse(issueCommentsListFixture, "PROJ-123");
    expect(result.comments).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.comments[0].providerCommentId).toBe("30001");
    expect(result.comments[1].providerCommentId).toBe("30002");
    expect(result.comments[1].authorName).toBe("Bob Jones");
    expect(result.comments[1].body).toBe("Second comment with more details.");
  });

  it("returns empty array for null input", () => {
    const result = parseCommentsResponse(null);
    expect(result.comments).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns empty array for missing comments key", () => {
    const result = parseCommentsResponse({ startAt: 0, maxResults: 50, total: 0 });
    expect(result.comments).toHaveLength(0);
  });
});

describe("normalizeTransition", () => {
  const raw = issueTransitionsListFixture.transitions[0] as any;

  it("maps all transition fields", () => {
    const t = normalizeTransition(raw);
    expect(t.id).toBe("11");
    expect(t.name).toBe("To Do");
    expect(t.toStatusId).toBe("10000");
    expect(t.toStatusName).toBe("To Do");
    expect(t.toStatusCategoryName).toBe("To Do");
    expect(t.hasScreen).toBe(false);
    expect(t.isGlobal).toBe(true);
    expect(t.isAvailable).toBe(true);
  });

  it("handles Done transition", () => {
    const doneRaw = issueTransitionsListFixture.transitions[2] as any;
    const t = normalizeTransition(doneRaw);
    expect(t.id).toBe("31");
    expect(t.name).toBe("Done");
    expect(t.toStatusCategoryName).toBe("Done");
  });

  it("handles missing fields gracefully", () => {
    const t = normalizeTransition({});
    expect(t.id).toBe("");
    expect(t.name).toBe("");
    expect(t.toStatusId).toBe("");
    expect(t.hasScreen).toBe(false);
    expect(t.isGlobal).toBe(false);
  });
});

describe("parseTransitionsResponse", () => {
  it("parses all transitions from fixture", () => {
    const result = parseTransitionsResponse(issueTransitionsListFixture);
    expect(result.transitions).toHaveLength(3);
    expect(result.transitions[0].name).toBe("To Do");
    expect(result.transitions[1].name).toBe("In Progress");
    expect(result.transitions[2].name).toBe("Done");
  });

  it("returns empty array for null input", () => {
    const result = parseTransitionsResponse(null);
    expect(result.transitions).toHaveLength(0);
  });

  it("returns empty array for missing transitions key", () => {
    const result = parseTransitionsResponse({ someOtherKey: [] });
    expect(result.transitions).toHaveLength(0);
  });
});
