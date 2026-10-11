import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import projectArchiveFixture from "../fixtures/project_archive.json";
import projectUpdateArchiveFixture from "../fixtures/project_update_archive.json";
import commentReactFixture from "../fixtures/comment_react.json";
import issueRelationCreateFixture from "../fixtures/issue_relation_create.json";
import projectMilestoneCreateFixture from "../fixtures/project_milestone_create.json";
import projectUpdateCreateFixture from "../fixtures/project_update_create.json";
import teamCreateFixture from "../fixtures/team_create.json";
import issueDeleteFixture from "../fixtures/issue_delete.json";
import attachmentFixture from "../fixtures/attachment.json";
import commentFixture from "../fixtures/comment.json";
import viewerFullFixture from "../fixtures/viewer_full.json";
import teamCyclesFixture from "../fixtures/team_cycles.json";
import issueDefaultsFixture from "../fixtures/issue_defaults.json";
import projectUpdateFixture from "../fixtures/project_update_get.json";
import teamIssuesFixture from "../fixtures/team_issues.json";
import issueDraftsFixture from "../fixtures/issue_drafts.json";
import commentsAllFixture from "../fixtures/comments_all.json";
import projectUpdatesFixture from "../fixtures/project_updates.json";
import issueRemoveLabelFixture from "../fixtures/issue_remove_label.json";
import reactionDeleteFixture from "../fixtures/reaction_delete.json";
import commentResolveFixture from "../fixtures/comment_resolve.json";
import graphqlExecuteFixture from "../fixtures/graphql_execute.json";
import projectUpdateUnarchiveFixture from "../fixtures/project_update_unarchive.json";
import commentUnresolveFixture from "../fixtures/comment_unresolve.json";
import projectUpdateUpdateFixture from "../fixtures/project_update_update.json";
import teamUpdateFixture from "../fixtures/team_update.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mockJson(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchFn };
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body ?? "{}"));
}

describe("linear composio deepen", () => {
  it("requires the documented fields on new write and get operations", () => {
    expect(() => actions["projects.archive"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["projectUpdates.archive"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["comments.react"]!({ apiKey: "k", emoji: "👍" })).toThrow("commentId is required");
    expect(() => actions["comments.react"]!({ apiKey: "k", commentId: "c1" })).toThrow("emoji is required");
    expect(() => actions["issueRelations.create"]!({ apiKey: "k", relatedIssueId: "b", type: "blocks" })).toThrow("issueId is required");
    expect(() => actions["issueRelations.create"]!({ apiKey: "k", issueId: "a", relatedIssueId: "b" })).toThrow("type is required");
    expect(() => actions["projectMilestones.create"]!({ apiKey: "k", projectId: "p" })).toThrow("name is required");
    expect(() => actions["projectMilestones.create"]!({ apiKey: "k", name: "Beta" })).toThrow("projectId is required");
    expect(() => actions["projectUpdates.create"]!({ apiKey: "k", body: "x" })).toThrow("projectId is required");
    expect(() => actions["projectUpdates.create"]!({ apiKey: "k", projectId: "p" })).toThrow("body is required");
    expect(() => actions["teams.create"]!({ apiKey: "k", key: "DES" })).toThrow("name is required");
    expect(() => actions["teams.create"]!({ apiKey: "k", name: "Design" })).toThrow("key is required");
    expect(() => actions["issues.delete"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["attachments.get"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["comments.get"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["cycles.listByTeam"]!({ apiKey: "k" })).toThrow("teamId is required");
    expect(() => actions["teams.issueDefaults"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["projectUpdates.get"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["issues.listByTeam"]!({ apiKey: "k" })).toThrow("teamId is required");
    expect(() => actions["issues.removeLabel"]!({ apiKey: "k", labelId: "l" })).toThrow("id is required");
    expect(() => actions["issues.removeLabel"]!({ apiKey: "k", id: "ENG-123" })).toThrow("labelId is required");
    expect(() => actions["reactions.remove"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["comments.resolve"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["graphql.execute"]!({ apiKey: "k" })).toThrow("query is required");
    expect(() => actions["projectUpdates.unarchive"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["comments.unresolve"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["projectUpdates.update"]!({ apiKey: "k" })).toThrow("id is required");
    expect(() => actions["teams.update"]!({ apiKey: "k" })).toThrow("id is required");
  });

  it("rejects an invalid issue relation type before calling Linear", () => {
    expect(() => actions["issueRelations.create"]!({
      apiKey: "k", issueId: "a", relatedIssueId: "b", type: "similar",
    })).toThrow("type must be one of: blocks, duplicate, related");
  });

  it("archives a project with projectArchive", async () => {
    const { calls, fetchFn } = mockJson(projectArchiveFixture);
    const result = await actions["projects.archive"]!({ apiKey: "k", id: "project-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(String(bodyOf(calls[0]!).query)).toContain("mutation ProjectArchive");
    expect((bodyOf(calls[0]!).variables as Record<string, unknown>).id).toBe("project-uuid");
    expect(result.success).toBe(true);
    expect(manifest.operations["projects.archive"].sideEffect).toBe("destructive");
  });

  it("archives a project update", async () => {
    const { fetchFn } = mockJson(projectUpdateArchiveFixture);
    const result = await actions["projectUpdates.archive"]!({ apiKey: "k", id: "update-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.success).toBe(true);
  });

  it("creates a comment reaction nested under variables.input", async () => {
    const { calls, fetchFn } = mockJson(commentReactFixture);
    const result = await actions["comments.react"]!({
      apiKey: "k", commentId: "comment-uuid", emoji: "👍", fetch: fetchFn,
    }) as Record<string, unknown>;
    const input = (bodyOf(calls[0]!).variables as Record<string, unknown>).input as Record<string, unknown>;
    expect(String(bodyOf(calls[0]!).query)).toContain("reactionCreate");
    expect(input.commentId).toBe("comment-uuid");
    expect(input.emoji).toBe("👍");
    expect((result.reaction as Record<string, unknown>).id).toBe("a1b2c3d4-0020-4a11-8b11-000000000020");
  });

  it("creates an issue relation with type blocks", async () => {
    const { calls, fetchFn } = mockJson(issueRelationCreateFixture);
    const result = await actions["issueRelations.create"]!({
      apiKey: "k", issueId: "issue-a", relatedIssueId: "issue-b", type: "blocks", fetch: fetchFn,
    }) as Record<string, unknown>;
    const input = (bodyOf(calls[0]!).variables as Record<string, unknown>).input as Record<string, unknown>;
    expect(input.type).toBe("blocks");
    expect((result.issueRelation as Record<string, unknown>).type).toBe("blocks");
  });

  it("creates a project milestone and omits unset optional fields", async () => {
    const { calls, fetchFn } = mockJson(projectMilestoneCreateFixture);
    const result = await actions["projectMilestones.create"]!({
      apiKey: "k", name: "Beta cut", projectId: "project-uuid", fetch: fetchFn,
    }) as Record<string, unknown>;
    const input = (bodyOf(calls[0]!).variables as Record<string, unknown>).input as Record<string, unknown>;
    expect(input.name).toBe("Beta cut");
    expect(input.description).toBeUndefined();
    expect((result.projectMilestone as Record<string, unknown>).id).toBe("a1b2c3d4-0022-4a11-8b11-000000000022");
  });

  it("creates a project update with health onTrack", async () => {
    const { calls, fetchFn } = mockJson(projectUpdateCreateFixture);
    const result = await actions["projectUpdates.create"]!({
      apiKey: "k", projectId: "project-uuid", body: "Shipped the API spec.", health: "onTrack", fetch: fetchFn,
    }) as Record<string, unknown>;
    const input = (bodyOf(calls[0]!).variables as Record<string, unknown>).input as Record<string, unknown>;
    expect(input.health).toBe("onTrack");
    expect((result.projectUpdate as Record<string, unknown>).health).toBe("onTrack");
  });

  it("creates a team with name and key", async () => {
    const { calls, fetchFn } = mockJson(teamCreateFixture);
    const result = await actions["teams.create"]!({
      apiKey: "k", name: "Design", key: "DES", fetch: fetchFn,
    }) as Record<string, unknown>;
    const input = (bodyOf(calls[0]!).variables as Record<string, unknown>).input as Record<string, unknown>;
    expect(input.name).toBe("Design");
    expect(input.key).toBe("DES");
    expect((result.team as Record<string, unknown>).id).toBe("a1b2c3d4-0024-4a11-8b11-000000000024");
  });

  it("deletes an issue with issueDelete", async () => {
    const { calls, fetchFn } = mockJson(issueDeleteFixture);
    const result = await actions["issues.delete"]!({ apiKey: "k", id: "ENG-123", fetch: fetchFn }) as Record<string, unknown>;
    expect(String(bodyOf(calls[0]!).query)).toContain("issueDelete");
    expect(result.success).toBe(true);
    expect(manifest.operations["issues.delete"].sideEffect).toBe("destructive");
  });

  it("gets an attachment record without touching uploads.linear.app", async () => {
    const { calls, fetchFn } = mockJson(attachmentFixture);
    const result = await actions["attachments.get"]!({ apiKey: "k", id: "attachment-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(new URL(calls[0]!.url).hostname).toBe("api.linear.app");
    expect(result.attachment).toEqual(attachmentFixture.data.attachment);
  });

  it("gets a comment by UUID", async () => {
    const { fetchFn } = mockJson(commentFixture);
    const result = await actions["comments.get"]!({ apiKey: "k", id: "comment-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.comment).toEqual(commentFixture.data.comment);
  });

  it("returns the authenticated viewer on users.me", async () => {
    const { calls, fetchFn } = mockJson(viewerFullFixture);
    const result = await actions["users.me"]!({ apiKey: "k", fetch: fetchFn }) as Record<string, unknown>;
    expect(String(bodyOf(calls[0]!).query)).toContain("viewer");
    expect(result.id).toBe("a1b2c3d4-0001-4a11-8b11-000000000001");
    expect(result.displayName).toBe("jamie");
    expect(result.active).toBe(true);
  });

  it("lists cycles for a team and returns the relay cursor", async () => {
    const { calls, fetchFn } = mockJson(teamCyclesFixture);
    const result = await actions["cycles.listByTeam"]!({
      apiKey: "k", teamId: "team-uuid", first: 10, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect((bodyOf(calls[0]!).variables as Record<string, unknown>).id).toBe("team-uuid");
    expect(result.cycles).toEqual(teamCyclesFixture.data.team.cycles.nodes);
    expect(result.nextCursor).toBe("cursor-team-cycles-end");
  });

  it("fetches issue defaults for a team", async () => {
    const { fetchFn } = mockJson(issueDefaultsFixture);
    const result = await actions["teams.issueDefaults"]!({ apiKey: "k", id: "team-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.team).toEqual(issueDefaultsFixture.data.team);
  });

  it("gets a project update", async () => {
    const { fetchFn } = mockJson(projectUpdateFixture);
    const result = await actions["projectUpdates.get"]!({ apiKey: "k", id: "update-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.projectUpdate).toEqual(projectUpdateFixture.data.projectUpdate);
  });

  it("lists issues for a team", async () => {
    const { calls, fetchFn } = mockJson(teamIssuesFixture);
    const result = await actions["issues.listByTeam"]!({
      apiKey: "k", teamId: "team-uuid", includeArchived: false, fetch: fetchFn,
    }) as Record<string, unknown>;
    expect((bodyOf(calls[0]!).variables as Record<string, unknown>).includeArchived).toBe(false);
    expect(result.issues).toEqual(teamIssuesFixture.data.team.issues.nodes);
    expect(result.hasNextPage).toBe(true);
  });

  it("lists the viewer's issue drafts from issueDrafts, not generic drafts", async () => {
    const { calls, fetchFn } = mockJson(issueDraftsFixture);
    const result = await actions["issueDrafts.list"]!({ apiKey: "k", first: 10, fetch: fetchFn }) as Record<string, unknown>;
    expect(String(bodyOf(calls[0]!).query)).toContain("issueDrafts");
    expect(String(bodyOf(calls[0]!).query)).not.toContain("viewer { drafts");
    expect(result.drafts).toEqual(issueDraftsFixture.data.viewer.issueDrafts.nodes);
    expect(result.hasNextPage).toBe(false);
  });

  it("lists workspace comments without an issue id", async () => {
    const { calls, fetchFn } = mockJson(commentsAllFixture);
    const result = await actions["comments.listAll"]!({
      apiKey: "k", first: 25, includeArchived: false, fetch: fetchFn,
    }) as Record<string, unknown>;
    const variables = bodyOf(calls[0]!).variables as Record<string, unknown>;
    expect(String(bodyOf(calls[0]!).query)).toContain("query Comments");
    expect(String(bodyOf(calls[0]!).query)).not.toContain("issue(id:");
    expect(variables.first).toBe(25);
    expect(variables.includeArchived).toBe(false);
    expect(variables.id).toBeUndefined();
    expect(result.comments).toEqual(commentsAllFixture.data.comments.nodes);
    expect(result.nextCursor).toBe("cursor-comments-end");
    expect(result.hasNextPage).toBe(true);
  });

  it("lists project updates with a relay cursor", async () => {
    const { fetchFn } = mockJson(projectUpdatesFixture);
    const result = await actions["projectUpdates.list"]!({ apiKey: "k", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.projectUpdates).toEqual(projectUpdatesFixture.data.projectUpdates.nodes);
    expect(result.nextCursor).toBe("cursor-project-updates-end");
  });

  it("removes a label from an issue", async () => {
    const { calls, fetchFn } = mockJson(issueRemoveLabelFixture);
    const result = await actions["issues.removeLabel"]!({
      apiKey: "k", id: "ENG-123", labelId: "label-uuid", fetch: fetchFn,
    }) as Record<string, unknown>;
    const variables = bodyOf(calls[0]!).variables as Record<string, unknown>;
    expect(String(bodyOf(calls[0]!).query)).toContain("issueRemoveLabel");
    expect(variables.id).toBe("ENG-123");
    expect(variables.labelId).toBe("label-uuid");
    expect(result.success).toBe(true);
  });

  it("deletes a reaction", async () => {
    const { fetchFn } = mockJson(reactionDeleteFixture);
    const result = await actions["reactions.remove"]!({ apiKey: "k", id: "reaction-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.success).toBe(true);
  });

  it("resolves a comment thread", async () => {
    const { calls, fetchFn } = mockJson(commentResolveFixture);
    const result = await actions["comments.resolve"]!({ apiKey: "k", id: "comment-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(String(bodyOf(calls[0]!).query)).toContain("commentResolve");
    expect((result.comment as Record<string, unknown>).resolvedAt).toBe("2026-08-22T16:00:00.000Z");
  });

  it("posts an arbitrary GraphQL document as the request query", async () => {
    const { calls, fetchFn } = mockJson(graphqlExecuteFixture);
    const result = await actions["graphql.execute"]!({
      apiKey: "k",
      query: "query { viewer { id } }",
      variables: {},
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(bodyOf(calls[0]!).query).toBe("query { viewer { id } }");
    expect(result.data).toEqual(graphqlExecuteFixture.data);
    expect(manifest.operations["graphql.execute"].sideEffect).toBe("write");
  });

  it("unarchives a project update", async () => {
    const { fetchFn } = mockJson(projectUpdateUnarchiveFixture);
    const result = await actions["projectUpdates.unarchive"]!({ apiKey: "k", id: "update-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.success).toBe(true);
  });

  it("unresolves a comment thread", async () => {
    const { fetchFn } = mockJson(commentUnresolveFixture);
    const result = await actions["comments.unresolve"]!({ apiKey: "k", id: "comment-uuid", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect((result.comment as Record<string, unknown>).resolvedAt).toBeUndefined();
  });

  it("updates a project update sending only provided fields", async () => {
    const { calls, fetchFn } = mockJson(projectUpdateUpdateFixture);
    const result = await actions["projectUpdates.update"]!({
      apiKey: "k", id: "update-uuid", health: "atRisk", fetch: fetchFn,
    }) as Record<string, unknown>;
    const input = (bodyOf(calls[0]!).variables as Record<string, unknown>).input as Record<string, unknown>;
    expect(input.health).toBe("atRisk");
    expect(input.body).toBeUndefined();
    expect((result.projectUpdate as Record<string, unknown>).health).toBe("atRisk");
  });

  it("updates a team sending only provided fields", async () => {
    const { calls, fetchFn } = mockJson(teamUpdateFixture);
    const result = await actions["teams.update"]!({
      apiKey: "k", id: "team-uuid", name: "Platform", fetch: fetchFn,
    }) as Record<string, unknown>;
    const input = (bodyOf(calls[0]!).variables as Record<string, unknown>).input as Record<string, unknown>;
    expect(input.name).toBe("Platform");
    expect(input.key).toBeUndefined();
    expect((result.team as Record<string, unknown>).name).toBe("Platform");
  });
});
