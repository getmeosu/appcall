import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import recordFixture from "../fixtures/record.json";
import searchFixture from "../fixtures/search.json";
import noteFixture from "../fixtures/note.json";
import taskFixture from "../fixtures/task.json";
import webhookFixture from "../fixtures/webhook.json";
import meetingFixture from "../fixtures/meeting.json";
import meetingCreatedFixture from "../fixtures/meetings-create.json";
import meetingGotFixture from "../fixtures/meetings-get.json";
import recordingFixture from "../fixtures/recording.json";
import deletedFixture from "../fixtures/deleted.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const token = "secret";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; init?: RequestInit };
function capture(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return json(body, status);
  };
  return { calls, fetchFn };
}

describe("attio deepening", () => {
  test("compiles one handler per action", () => {
    const keys = Object.keys(manifest.operations).sort();
    expect(Object.keys(actions).sort()).toEqual(keys);
    expect(keys).toContain("records.search");
    expect(keys).toContain("companies.assert");
    expect(keys).toContain("call_recordings.get");
    expect(keys).toContain("meetings.create");
    expect(keys).toContain("meetings.get");
    expect(keys).toHaveLength(111);
    expect(keys).toContain("records.find");
    expect(keys).toContain("records.searchV2");
    expect(keys).toContain("workspace_members.listV2");
  });

  test("creates generic records and asserts with matching_attribute", async () => {
    const created = capture({ data: recordFixture });
    await actions["records.create"]!({
      accessToken: token,
      object: "people",
      values: { email_addresses: ["ada@example.com"] },
      fetch: created.fetchFn,
    });
    expect(created.calls[0]!.url).toBe("https://api.attio.com/v2/objects/people/records");
    expect(created.calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(created.calls[0]!.init?.body))).toEqual({
      data: { values: { email_addresses: ["ada@example.com"] } },
    });

    const asserted = capture({ data: recordFixture });
    await actions["records.assert"]!({
      accessToken: token,
      object: "companies",
      matchingAttribute: "domains",
      values: { domains: ["example.com"] },
      fetch: asserted.fetchFn,
    });
    const assertedUrl = new URL(asserted.calls[0]!.url);
    expect(assertedUrl.pathname).toBe("/v2/objects/companies/records");
    expect(assertedUrl.searchParams.get("matching_attribute")).toBe("domains");
    expect(asserted.calls[0]!.init?.method).toBe("PUT");
  });

  test("overwrites, patches, and deletes records on documented routes", async () => {
    const id = "891dcbfc-9141-415d-9b2a-2238a6cc012d";
    const patched = capture({ data: recordFixture });
    await actions["records.update"]!({ accessToken: token, object: "people", recordId: id, values: { job_title: "Engineer" }, fetch: patched.fetchFn });
    expect(patched.calls[0]!.init?.method).toBe("PATCH");
    expect(new URL(patched.calls[0]!.url).pathname).toBe(`/v2/objects/people/records/${id}`);

    const overwritten = capture({ data: recordFixture });
    await actions["records.overwrite"]!({ accessToken: token, object: "people", recordId: id, values: { job_title: "CTO" }, fetch: overwritten.fetchFn });
    expect(overwritten.calls[0]!.init?.method).toBe("PUT");

    const deleted = capture(deletedFixture);
    await actions["records.delete"]!({ accessToken: token, object: "people", recordId: id, fetch: deleted.fetchFn });
    expect(deleted.calls[0]!.init?.method).toBe("DELETE");
  });

  test("searches across objects with request_as", async () => {
    const { calls, fetchFn } = capture(searchFixture);
    const result = await actions["records.search"]!({
      accessToken: token,
      query: "ada",
      objects: ["people", "companies"],
      requestAs: { type: "workspace" },
      limit: 10,
      fetch: fetchFn,
    });
    expect(calls[0]!.url).toBe("https://api.attio.com/v2/objects/records/search");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      query: "ada",
      objects: ["people", "companies"],
      request_as: { type: "workspace" },
      limit: 10,
    });
    expect(result).toMatchObject({ data: searchFixture.data, source: "provider" });
  });

  test("standard-object convenience paths stay on companies/people/deals/users/workspaces", async () => {
    const company = capture({ data: recordFixture });
    await actions["companies.create"]!({
      accessToken: token,
      name: "Salarya",
      domains: ["salarya.com"],
      fetch: company.fetchFn,
    });
    expect(company.calls[0]!.url).toBe("https://api.attio.com/v2/objects/companies/records");
    expect(JSON.parse(String(company.calls[0]!.init?.body))).toEqual({
      data: { values: { name: "Salarya", domains: ["salarya.com"] } },
    });

    const person = capture({ data: recordFixture });
    await actions["people.assert"]!({
      accessToken: token,
      matchingAttribute: "email_addresses",
      values: { email_addresses: ["ada@example.com"], name: [{ full_name: "Ada Lovelace" }] },
      fetch: person.fetchFn,
    });
    expect(new URL(person.calls[0]!.url).pathname).toBe("/v2/objects/people/records");
    expect(new URL(person.calls[0]!.url).searchParams.get("matching_attribute")).toBe("email_addresses");

    const deal = capture({ data: recordFixture });
    await actions["deals.list"]!({ accessToken: token, limit: 5, fetch: deal.fetchFn });
    expect(deal.calls[0]!.url).toBe("https://api.attio.com/v2/objects/deals/records/query");
    expect(deal.calls[0]!.init?.method).toBe("POST");

    const user = capture({ data: recordFixture });
    await actions["users.create"]!({
      accessToken: token,
      userId: "user_123",
      primaryEmailAddress: "user@example.com",
      fetch: user.fetchFn,
    });
    expect(user.calls[0]!.url).toBe("https://api.attio.com/v2/objects/users/records");

    const workspace = capture({ data: recordFixture });
    await actions["workspace_records.get"]!({
      accessToken: token,
      recordId: "891dcbfc-9141-415d-9b2a-2238a6cc012d",
      fetch: workspace.fetchFn,
    });
    expect(new URL(workspace.calls[0]!.url).pathname).toBe(
      "/v2/objects/workspaces/records/891dcbfc-9141-415d-9b2a-2238a6cc012d",
    );
  });

  test("lists, notes, tasks, comments, and webhooks use documented v2 routes", async () => {
    const listed = capture({ data: [] });
    await actions["lists.list"]!({ accessToken: token, fetch: listed.fetchFn });
    expect(listed.calls[0]!.url).toBe("https://api.attio.com/v2/lists");

    const entry = capture({ data: recordFixture });
    await actions["entries.create"]!({
      accessToken: token,
      list: "sales",
      parentObject: "people",
      parentRecordId: "891dcbfc-9141-415d-9b2a-2238a6cc012d",
      entryValues: { stage: "Lead" },
      fetch: entry.fetchFn,
    });
    expect(entry.calls[0]!.url).toBe("https://api.attio.com/v2/lists/sales/entries");
    expect(JSON.parse(String(entry.calls[0]!.init?.body))).toEqual({
      data: {
        parent_object: "people",
        parent_record_id: "891dcbfc-9141-415d-9b2a-2238a6cc012d",
        entry_values: { stage: "Lead" },
      },
    });

    const note = capture({ data: noteFixture });
    await actions["notes.create"]!({
      accessToken: token,
      title: "Call",
      content: "Follow up",
      parentObject: "people",
      parentRecordId: "891dcbfc-9141-415d-9b2a-2238a6cc012d",
      format: "plaintext",
      fetch: note.fetchFn,
    });
    expect(note.calls[0]!.url).toBe("https://api.attio.com/v2/notes");

    const task = capture({ data: taskFixture });
    await actions["tasks.create"]!({ accessToken: token, content: "Ping Ada", fetch: task.fetchFn });
    expect(task.calls[0]!.url).toBe("https://api.attio.com/v2/tasks");
    expect(JSON.parse(String(task.calls[0]!.init?.body))).toEqual({ data: { content: "Ping Ada" } });

    const comment = capture({ data: { id: "c1" } });
    await actions["comments.create"]!({
      accessToken: token,
      content: "Looks good",
      author: { type: "workspace-member", id: "50cf242c-7fa3-4cad-87d0-75b1af71c57b" },
      threadId: "thread-1",
      fetch: comment.fetchFn,
    });
    expect(comment.calls[0]!.url).toBe("https://api.attio.com/v2/comments");

    const hook = capture({ data: webhookFixture });
    await actions["webhooks.create"]!({
      accessToken: token,
      targetUrl: "https://example.com/hook",
      subscriptions: [{ event_type: "record.created" }],
      fetch: hook.fetchFn,
    });
    expect(hook.calls[0]!.url).toBe("https://api.attio.com/v2/webhooks");
    expect(hook.calls[0]!.init?.method).toBe("POST");
  });

  test("meetings and call recordings require meeting IDs on the path", async () => {
    const meetings = capture({ data: [meetingFixture] });
    await actions["meetings.list"]!({ accessToken: token, limit: 20, fetch: meetings.fetchFn });
    expect(new URL(meetings.calls[0]!.url).pathname).toBe("/v2/meetings");
    expect(new URL(meetings.calls[0]!.url).searchParams.get("limit")).toBe("20");

    const recs = capture({ data: [recordingFixture] });
    await actions["call_recordings.list"]!({
      accessToken: token,
      meetingId: "cb59ab17-ad15-460c-a126-0715617c0853",
      fetch: recs.fetchFn,
    });
    expect(new URL(recs.calls[0]!.url).pathname).toBe(
      "/v2/meetings/cb59ab17-ad15-460c-a126-0715617c0853/call_recordings",
    );

    const rec = capture({ data: recordingFixture });
    await actions["call_recordings.get"]!({
      accessToken: token,
      meetingId: "cb59ab17-ad15-460c-a126-0715617c0853",
      callRecordingId: "e8f2a3b7-9b4d-4c5e-8a1f-3d7b2c5e8f9a",
      fetch: rec.fetchFn,
    });
    expect(new URL(rec.calls[0]!.url).pathname).toBe(
      "/v2/meetings/cb59ab17-ad15-460c-a126-0715617c0853/call_recordings/e8f2a3b7-9b4d-4c5e-8a1f-3d7b2c5e8f9a",
    );
  });

  test("creates and gets a meeting as JSON", async () => {
    const created = capture(meetingCreatedFixture);
    const createdResult = await actions["meetings.create"]!({
      accessToken: token,
      title: "Onboarding Session",
      description: "Getting you up to speed with the platform and answering any questions you have.",
      is_all_day: false,
      start: { datetime: "2027-11-27T14:00:00Z", timezone: "America/New_York" },
      end: { datetime: "2027-11-27T15:00:00Z", timezone: "America/New_York" },
      participants: [{ email_address: "person@company.com", is_organizer: true, status: "accepted", name: "Simon Mitchell" }],
      linked_records: [{ object: "people", record_id: "891dcbfc-9141-415d-9b2a-2238a6cc012d" }],
      fetch: created.fetchFn,
    });
    expect(created.calls[0]!.url).toBe("https://api.attio.com/v2/meetings");
    expect(created.calls[0]!.init?.method).toBe("POST");
    expect(new Headers(created.calls[0]!.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(created.calls[0]!.init?.body))).toEqual({
      data: {
        title: "Onboarding Session",
        description: "Getting you up to speed with the platform and answering any questions you have.",
        start: { datetime: "2027-11-27T14:00:00Z", timezone: "America/New_York" },
        end: { datetime: "2027-11-27T15:00:00Z", timezone: "America/New_York" },
        is_all_day: false,
        participants: [{ email_address: "person@company.com", is_organizer: true, status: "accepted", name: "Simon Mitchell" }],
        linked_records: [{ object: "people", record_id: "891dcbfc-9141-415d-9b2a-2238a6cc012d" }],
      },
    });
    expect(createdResult).toMatchObject({ data: meetingCreatedFixture.data, source: "provider" });

    const omitted = capture(meetingCreatedFixture);
    await actions["meetings.create"]!({
      accessToken: token,
      title: "All day",
      description: "All day meeting.",
      is_all_day: true,
      start: { date: "2027-11-27" },
      end: { date: "2027-11-28" },
      participants: [{ name: "Simon Mitchell", is_organizer: "true", status: "pending" }],
      fetch: omitted.fetchFn,
    });
    expect(JSON.parse(String(omitted.calls[0]!.init?.body))).toEqual({
      data: {
        title: "All day",
        description: "All day meeting.",
        start: { date: "2027-11-27" },
        end: { date: "2027-11-28" },
        is_all_day: true,
        participants: [{ name: "Simon Mitchell", is_organizer: "true", status: "pending" }],
      },
    });

    const got = capture(meetingGotFixture);
    const gotResult = await actions["meetings.get"]!({
      accessToken: token,
      meeting_id: "cb59ab17-ad15-460c-a126-0715617c0853",
      fetch: got.fetchFn,
    });
    expect(got.calls[0]!.url).toBe("https://api.attio.com/v2/meetings/cb59ab17-ad15-460c-a126-0715617c0853");
    expect(got.calls[0]!.init?.method ?? "GET").toBe("GET");
    expect(got.calls[0]!.init?.body ?? null).toBeNull();
    expect(new Headers(got.calls[0]!.init?.headers).get("content-type")).toBeNull();
    expect(gotResult).toMatchObject({ data: meetingGotFixture.data, source: "provider" });
  });

  test("covers remaining Composio aliases with distinct HTTP requests", async () => {
    const id = "891dcbfc-9141-415d-9b2a-2238a6cc012d";

    const found = capture({ data: [recordFixture] });
    await actions["records.find"]!({
      accessToken: token,
      object: "people",
      attributes: { email_addresses: "ada@example.com" },
      limit: 5,
      fetch: found.fetchFn,
    });
    expect(new URL(found.calls[0]!.url).pathname).toBe("/v2/objects/people/records/query");
    expect(found.calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(found.calls[0]!.init?.body))).toEqual({
      filter: { email_addresses: "ada@example.com" },
      limit: 5,
    });

    const queried = capture({ data: [recordFixture] });
    await actions["records.query"]!({
      accessToken: token,
      object: "companies",
      filter: { name: { $contains: "Salarya" } },
      sorts: [{ attribute: "created_at", direction: "desc" }],
      fetch: queried.fetchFn,
    });
    expect(JSON.parse(String(queried.calls[0]!.init?.body))).toEqual({
      filter: { name: { $contains: "Salarya" } },
      sorts: [{ attribute: "created_at", direction: "desc" }],
    });

    const postQuery = capture({ data: [recordFixture] });
    await actions["records.postQuery"]!({ accessToken: token, object: "deals", offset: 10, fetch: postQuery.fetchFn });
    expect(new URL(postQuery.calls[0]!.url).pathname).toBe("/v2/objects/deals/records/query");
    expect(JSON.parse(String(postQuery.calls[0]!.init?.body))).toEqual({ offset: 10 });

    const posted = capture({ data: recordFixture });
    await actions["records.post"]!({
      accessToken: token,
      object: "people",
      values: { email_addresses: ["ada@example.com"] },
      fetch: posted.fetchFn,
    });
    expect(posted.calls[0]!.url).toBe("https://api.attio.com/v2/objects/people/records");
    expect(posted.calls[0]!.init?.method).toBe("POST");

    const byId = capture({ data: recordFixture });
    await actions["records.getById"]!({ accessToken: token, object: "people", recordId: id, fetch: byId.fetchFn });
    expect(new URL(byId.calls[0]!.url).pathname).toBe(`/v2/objects/people/records/${id}`);
    expect(byId.calls[0]!.init?.method).toBe("GET");

    const patched = capture({ data: recordFixture });
    await actions["records.patch"]!({
      accessToken: token,
      object: "people",
      recordId: id,
      values: { job_title: "Engineer" },
      fetch: patched.fetchFn,
    });
    expect(patched.calls[0]!.init?.method).toBe("PATCH");
    expect(JSON.parse(String(patched.calls[0]!.init?.body))).toEqual({ data: { values: { job_title: "Engineer" } } });

    const searchV2 = capture(searchFixture);
    await actions["records.searchV2"]!({
      accessToken: token,
      query: "ada",
      objects: ["people"],
      requestAs: "workspace",
      fetch: searchV2.fetchFn,
    });
    expect(searchV2.calls[0]!.url).toBe("https://api.attio.com/v2/objects/records/search");
    expect(JSON.parse(String(searchV2.calls[0]!.init?.body))).toEqual({
      query: "ada",
      objects: ["people"],
      request_as: { type: "workspace" },
    });

    const listed = capture({ data: [] });
    await actions["lists.entries.list"]!({ accessToken: token, list: "sales", fetch: listed.fetchFn });
    expect(listed.calls[0]!.url).toBe("https://api.attio.com/v2/lists/sales/entries/query");
    expect(listed.calls[0]!.init?.method).toBe("POST");

    const queriedEntries = capture({ data: [] });
    await actions["entries.query"]!({
      accessToken: token,
      list: "sales",
      filter: { stage: "Lead" },
      fetch: queriedEntries.fetchFn,
    });
    expect(JSON.parse(String(queriedEntries.calls[0]!.init?.body))).toEqual({ filter: { stage: "Lead" } });

    const createdEntry = capture({ data: recordFixture });
    await actions["lists.entries.create"]!({
      accessToken: token,
      list: "sales",
      parentObject: "people",
      parentRecordId: id,
      fetch: createdEntry.fetchFn,
    });
    expect(createdEntry.calls[0]!.url).toBe("https://api.attio.com/v2/lists/sales/entries");
    expect(createdEntry.calls[0]!.init?.method).toBe("POST");

    const patchedEntry = capture({ data: recordFixture });
    await actions["entries.patch"]!({
      accessToken: token,
      list: "sales",
      entryId: "entry-1",
      entryValues: { stage: "Won" },
      fetch: patchedEntry.fetchFn,
    });
    expect(new URL(patchedEntry.calls[0]!.url).pathname).toBe("/v2/lists/sales/entries/entry-1");
    expect(patchedEntry.calls[0]!.init?.method).toBe("PATCH");

    const members = capture({ data: [] });
    await actions["workspace_members.listV2"]!({ accessToken: token, fetch: members.fetchFn });
    expect(members.calls[0]!.url).toBe("https://api.attio.com/v2/workspace_members");
    expect(members.calls[0]!.init?.method).toBe("GET");
  });

  test("rejects extra healthcheck fields and invalid records.list limits", async () => {
    await expect(actions.healthcheck!({ accessToken: token, unknownField: "nope", fetch: async () => json({}) })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["records.list"]!({ accessToken: token, object: "people", limit: 0, fetch: async () => json({}) })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });
});
