import { describe, expect, test } from "bun:test";
import {
  executeCandidatesCreateNote,
  executeCandidatesListNotes,
  executeCandidatesAddTag,
  executeCandidateTagsList,
  executeCandidateTagsCreate,
  executeApplicationsChangeSource,
  executeApplicationsTransfer,
  executeApplicationsUpdate,
  executeApplicationsListHistory,
  executeApplicationFeedbackList,
  executeApplicationFeedbackSubmit,
  executeHiringTeamAddMember,
  executeHiringTeamRemoveMember,
  executeHiringTeamRolesList,
  executeUsersGet,
} from "../src/g1";
import noteCreated from "../fixtures/candidate_note_created.json";
import notesList from "../fixtures/candidate_notes_list.json";
import tagAdded from "../fixtures/candidate_tag_added.json";
import tagsList from "../fixtures/candidate_tags_list.json";
import tagCreated from "../fixtures/candidate_tag_created.json";
import sourceChanged from "../fixtures/application_source_changed.json";
import transferred from "../fixtures/application_transferred.json";
import appUpdated from "../fixtures/application_updated.json";
import historyList from "../fixtures/application_history_list.json";
import feedbackList from "../fixtures/application_feedback_list.json";
import feedbackSubmitted from "../fixtures/application_feedback_submitted.json";
import memberAdded from "../fixtures/hiring_team_member_added.json";
import memberRemoved from "../fixtures/hiring_team_member_removed.json";
import rolesList from "../fixtures/hiring_team_roles_list.json";
import userInfo from "../fixtures/user_info.json";

function stubFetch(body: string, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey" };

describe("Ashby G1 candidates.create_note / list_notes", () => {
  test("create_note POSTs /candidate.createNote", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(noteCreated));
    const result = await executeCandidatesCreateNote({
      ...auth,
      candidateId: "cand-1",
      note: "Strong candidate",
      isPrivate: false,
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe("/candidate.createNote");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      candidateId: "cand-1",
      note: "Strong candidate",
      isPrivate: false,
    });
    expect((result.note as { id?: string })?.id).toBe("5fa61e0b-3c4d-4e5f-9a0b-1c2d3e4f5a6b");
  });

  test("list_notes POSTs /candidate.listNotes", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(notesList));
    const result = await executeCandidatesListNotes({
      ...auth,
      candidateId: "cand-1",
      limit: 10,
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/candidate.listNotes");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ candidateId: "cand-1", limit: 10 });
    expect(result.notes).toHaveLength(1);
    expect(result.moreDataAvailable).toBe(false);
  });

  test("create_note rejects missing note before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeCandidatesCreateNote({ ...auth, candidateId: "cand-1", note: "", fetch: impl }),
    ).rejects.toThrow(/note/);
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby G1 candidate tags", () => {
  test("add_tag POSTs /candidate.addTag", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(tagAdded));
    const result = await executeCandidatesAddTag({
      ...auth,
      candidateId: "cand-1",
      tagId: "tag-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/candidate.addTag");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ candidateId: "cand-1", tagId: "tag-1" });
    expect((result.candidate as { id?: string })?.id).toBe("e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
  });

  test("candidate_tags.list POSTs /candidateTag.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(tagsList));
    const result = await executeCandidateTagsList({ ...auth, includeArchived: false, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/candidateTag.list");
    expect(result.tags).toHaveLength(2);
  });

  test("candidate_tags.create POSTs /candidateTag.create", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(tagCreated));
    const result = await executeCandidateTagsCreate({ ...auth, title: "Strong candidate", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/candidateTag.create");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ title: "Strong candidate" });
    expect((result.tag as { title?: string })?.title).toBe("Strong candidate");
  });
});

describe("Ashby G1 applications source/transfer/update/history", () => {
  test("change_source POSTs /application.changeSource", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(sourceChanged));
    await executeApplicationsChangeSource({
      ...auth,
      applicationId: "app-1",
      sourceId: "src-2",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/application.changeSource");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ applicationId: "app-1", sourceId: "src-2" });
  });

  test("transfer POSTs /application.transfer and returns null for Reconcile", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(transferred));
    const result = await executeApplicationsTransfer({
      ...auth,
      applicationId: "app-1",
      jobId: "job-2",
      interviewPlanId: "plan-1",
      interviewStageId: "stage-1",
      startAutomaticActivities: true,
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe("/application.transfer");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      applicationId: "app-1",
      jobId: "job-2",
      interviewPlanId: "plan-1",
      interviewStageId: "stage-1",
      startAutomaticActivities: true,
    });
    expect(result.application).toBeNull();
  });

  test("update POSTs /application.update", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(appUpdated));
    await executeApplicationsUpdate({
      ...auth,
      applicationId: "app-1",
      sourceId: "src-2",
      creditedToUserId: "usr-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/application.update");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      applicationId: "app-1",
      sourceId: "src-2",
      creditedToUserId: "usr-1",
    });
  });

  test("list_history POSTs /application.listHistory", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(historyList));
    const result = await executeApplicationsListHistory({
      ...auth,
      applicationId: "app-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/application.listHistory");
    expect(result.history).toHaveLength(1);
  });
});

describe("Ashby G1 application feedback", () => {
  test("list POSTs /applicationFeedback.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(feedbackList));
    const result = await executeApplicationFeedbackList({
      ...auth,
      applicationId: "app-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/applicationFeedback.list");
    expect(result.feedback).toHaveLength(1);
  });

  test("submit POSTs /applicationFeedback.submit", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(feedbackSubmitted));
    const result = await executeApplicationFeedbackSubmit({
      ...auth,
      applicationId: "app-1",
      formDefinitionId: "form-1",
      feedbackForm: { overall_recommendation: "3" },
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/applicationFeedback.submit");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      applicationId: "app-1",
      formDefinitionId: "form-1",
      feedbackForm: { overall_recommendation: "3" },
    });
    expect(result.feedback).toBeTruthy();
  });
});

describe("Ashby G1 hiring team + users.get", () => {
  test("add_member POSTs /hiringTeam.addMember with jobId target", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(memberAdded));
    const result = await executeHiringTeamAddMember({
      ...auth,
      teamMemberId: "usr-1",
      roleId: "Hiring Manager",
      jobId: "job-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/hiringTeam.addMember");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      teamMemberId: "usr-1",
      roleId: "Hiring Manager",
      jobId: "job-1",
    });
    expect(Array.isArray(result.members)).toBe(true);
  });

  test("remove_member rejects missing target before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeHiringTeamRemoveMember({
        ...auth,
        teamMemberId: "usr-1",
        roleId: "Hiring Manager",
        fetch: impl,
      }),
    ).rejects.toThrow(/exactly one/);
    expect(calls).toHaveLength(0);
  });

  test("remove_member POSTs /hiringTeam.removeMember", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(memberRemoved));
    await executeHiringTeamRemoveMember({
      ...auth,
      teamMemberId: "usr-1",
      roleId: "Hiring Manager",
      applicationId: "app-1",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/hiringTeam.removeMember");
  });

  test("hiring_team_roles.list requires namesOnly", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(rolesList));
    const result = await executeHiringTeamRolesList({ ...auth, namesOnly: true, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/hiringTeamRole.list");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ namesOnly: true });
    expect(result.roles).toContain("Recruiter");
  });

  test("users.get POSTs /user.info", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(userInfo));
    const result = await executeUsersGet({ ...auth, userId: "usr-1", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/user.info");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ userId: "usr-1" });
    expect((result.user as { email?: string })?.email).toBe("ada@example.com");
  });
});
