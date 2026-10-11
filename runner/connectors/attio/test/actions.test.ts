import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import self from "../fixtures/self.json";
import list from "../fixtures/list.json";
import recordBody from "../fixtures/record.json";
import noteBody from "../fixtures/note.json";
import notesBody from "../fixtures/notes.json";
import taskBody from "../fixtures/task.json";
import listsBody from "../fixtures/lists.json";
import membersBody from "../fixtures/members.json";
const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("attio HTTP contract", () => {
  test("healthcheck uses bearer auth and validates output", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ accessToken: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(self); } });
    expect(seen[0].url).toBe("https://api.attio.com/v2/self");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ self, source: "provider" });
  });
  test("maps list and encodes IDs without following links", async () => {
    const seen: Request[] = [];
    const result = await actions["objects.get"]!({ accessToken: "secret", object: "people/a", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({data:list.data[0]}); } });
    expect(new URL(seen[0].url).pathname).toBe("/v2/objects/people%2Fa");
    expect(result).toMatchObject({ object: list.data[0], source: "provider" });
    expect(seen).toHaveLength(1);
  });
  test("maps rate limits and malformed output safely", async () => {
    await expect(actions["objects.list"]!({ accessToken: "secret", fetch: async () => response({message:"slow"},429) })).rejects.toMatchObject({code:"CONNECTOR_RATE_LIMITED"});
    await expect(actions["objects.list"]!({ accessToken: "secret", fetch: async () => response({data:{}}) })).rejects.toMatchObject({code:"CONNECTOR_RESPONSE_INVALID"});
  });
  test("creates records with values body and matching attribute query", async () => {
    const seen: Request[] = [];
    const created = await actions["records.create"]!({ accessToken: "secret", object: "people", values: { email_addresses: ["ada@example.com"] }, fetch: async (input, init) => { seen.push(new Request(input, init)); return response(recordBody); } });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/v2/objects/people/records");
    expect(await seen[0].clone().json()).toEqual({ data: { values: { email_addresses: ["ada@example.com"] } } });
    expect(created).toMatchObject({ record: recordBody.data, source: "provider" });
    const asserted = await actions["records.assert"]!({ accessToken: "secret", object: "people", matchingAttribute: "email_addresses", values: { email_addresses: ["ada@example.com"] }, fetch: async (input, init) => { seen.push(new Request(input, init)); return response(recordBody); } });
    expect(new URL(seen[1].url).searchParams.get("matching_attribute")).toBe("email_addresses");
    expect(asserted).toMatchObject({ record: recordBody.data });
  });
  test("writes notes, tasks, comments and lists workspace members", async () => {
    const seen: Request[] = [];
    const fetchFor = (body: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => { seen.push(new Request(input, init)); return response(body); };
    await expect(actions["notes.create"]!({ accessToken: "secret", parentObject: "people", parentRecordId: "rec_1", title: "Intro", content: "Hello", fetch: fetchFor(noteBody) })).resolves.toMatchObject({ note: noteBody.data });
    await expect(actions["notes.list"]!({ accessToken: "secret", parentObject: "people", parentRecordId: "rec_1", fetch: fetchFor(notesBody) })).resolves.toMatchObject({ notes: notesBody.data });
    await expect(actions["tasks.create"]!({ accessToken: "secret", content: "Follow up", fetch: fetchFor(taskBody) })).resolves.toMatchObject({ task: taskBody.data });
    await expect(actions["lists.list"]!({ accessToken: "secret", fetch: fetchFor(listsBody) })).resolves.toMatchObject({ lists: listsBody.data });
    await expect(actions["workspace_members.list"]!({ accessToken: "secret", fetch: fetchFor(membersBody) })).resolves.toMatchObject({ members: membersBody.data });
    expect(seen[0].headers.get("content-type")).toBe("application/json");
  });
  test("deletes records as a destructive write", async () => {
    const seen: Request[] = [];
    const result = await actions["records.delete"]!({ accessToken: "secret", object: "people", recordId: "rec_1", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ data: { id: { record_id: "rec_1" } } }); } });
    expect(seen[0].method).toBe("DELETE");
    expect(result).toMatchObject({ record: { id: { record_id: "rec_1" } }, source: "provider" });
  });
});
