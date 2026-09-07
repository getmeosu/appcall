import { describe, expect, it } from "bun:test";
import { normalizeIssue, parseIssuesResponse } from "../src/issues";
import issuesSearch from "../fixtures/issues_search.json";
import issuesSearchLast from "../fixtures/issues_search_last.json";

describe("normalizeIssue", () => {
  const raw1 = issuesSearch.issues[0] as any;
  const raw2 = issuesSearch.issues[1] as any;

  it("maps all issue fields", () => {
    const i = normalizeIssue(raw1);
    expect(i.id).toBe("jira-issue:10001");
    expect(i.provider).toBe("jira");
    expect(i.providerIssueId).toBe("10001");
    expect(i.key).toBe("PROJ-123");
    expect(i.summary).toBe("Fix login bug");
    expect(i.description).toBe("Users cannot log in after password reset.");
    expect(i.status).toBe("In Progress");
    expect(i.statusCategory).toBe("In Progress");
    expect(i.priority).toBe("Medium");
    expect(i.issueType).toBe("Bug");
    expect(i.assigneeId).toBe("uuid-assignee-1");
    expect(i.assigneeName).toBe("Jane Smith");
    expect(i.reporterId).toBe("uuid-reporter-1");
    expect(i.reporterName).toBe("Bob Jones");
    expect(i.projectKey).toBe("PROJ");
    expect(i.projectName).toBe("Main Project");
    expect(i.labels).toEqual(["login", "urgent"]);
    expect(i.dueDate).toBe("2025-06-30");
    expect(i.modelVersion).toBe("2026-05-16");
  });

  it("handles null fields", () => {
    const i = normalizeIssue(raw2);
    expect(i.id).toBe("jira-issue:10002");
    expect(i.summary).toBe("Add dark mode");
    expect(i.description).toBe("");
    expect(i.assigneeId).toBe("");
    expect(i.labels).toEqual([]);
    expect(i.dueDate).toBe("");
  });
});

describe("parseIssuesResponse", () => {
  it("parses issues with next page token", () => {
    const result = parseIssuesResponse(issuesSearch);
    expect(result.issues).toHaveLength(2);
    expect(result.nextPageToken).toBe("abc123cursor");
  });

  it("returns null token for last page", () => {
    const result = parseIssuesResponse(issuesSearchLast);
    expect(result.issues).toHaveLength(1);
    expect(result.nextPageToken).toBeNull();
  });

  it("handles null input", () => {
    const result = parseIssuesResponse(null);
    expect(result.issues).toHaveLength(0);
  });
});
