import { describe, expect, it } from "bun:test";
import {
  searchCompanies,
  searchDeals,
  searchTickets,
  createNote,
  createMeeting,
  createCall,
  createTask,
  listOwners,
  listDealPipelines,
  createAssociation,
} from "../src/actions";
import searchCompaniesFixture from "../fixtures/search_companies.json";
import searchDealsFixture from "../fixtures/search_deals.json";
import searchTicketsFixture from "../fixtures/search_tickets.json";
import createNoteFixture from "../fixtures/create_note.json";
import createMeetingFixture from "../fixtures/create_meeting.json";
import createCallFixture from "../fixtures/create_call.json";
import createTaskFixture from "../fixtures/create_task.json";
import ownersListFixture from "../fixtures/owners_list.json";
import pipelinesDealsFixture from "../fixtures/pipelines_deals.json";
import createAssociationFixture from "../fixtures/create_association.json";

function createRateLimitFetch() {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ status: "error", message: "rate limit" }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "30" },
      }),
    );
}

function createUpstreamErrorFetch(status: number) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify({ status: "error", message: "upstream error" }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

function capturingJsonFetch(status: number, body: unknown, captured: { url?: string; method?: string; auth?: string; body?: string }) {
  return (url: string, init?: RequestInit) => {
    captured.url = url;
    captured.method = init?.method ?? "GET";
    captured.auth = (init?.headers as Record<string, string>)?.["Authorization"] ?? "";
    captured.body = typeof init?.body === "string" ? init.body : "";
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

describe("searchCompanies action", () => {
  it("validates input without accessToken", () => {
    const result = searchCompanies({ query: "Acme", limit: 10 });
    expect(result.connector).toBe("hubspot");
    expect(result.action).toBe("companies.search");
    expect((result as any).validated.query).toBe("Acme");
    expect((result as any).validated.limit).toBe(10);
  });

  it("searches companies with accessToken", async () => {
    const captured: { url?: string; method?: string; auth?: string; body?: string } = {};
    const result = await searchCompanies({
      accessToken: "tok-abc",
      query: "Acme",
      limit: 10,
      fetch: capturingJsonFetch(200, searchCompaniesFixture, captured),
    });
    expect(result.action).toBe("companies.search");
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/objects/companies/search");
    expect(captured.method).toBe("POST");
    expect(captured.auth).toBe("Bearer tok-abc");
    expect(JSON.parse(captured.body ?? "{}").query).toBe("Acme");
    expect((result as any).companies).toHaveLength(2);
    expect((result as any).companies[0].id).toBe("hs-company:301");
    expect((result as any).total).toBe(2);
    expect((result as any).nextCursor).toBe("302");
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = searchCompanies({ accessToken: "tok", query: "x", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("searchDeals action", () => {
  it("validates input without accessToken", () => {
    const result = searchDeals({ query: "Enterprise" });
    expect(result.action).toBe("deals.search");
    expect((result as any).validated.query).toBe("Enterprise");
  });

  it("searches deals with accessToken", async () => {
    const captured: { url?: string; method?: string; auth?: string; body?: string } = {};
    const result = await searchDeals({
      accessToken: "tok-abc",
      query: "Enterprise",
      fetch: capturingJsonFetch(200, searchDealsFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/objects/deals/search");
    expect(captured.method).toBe("POST");
    expect((result as any).deals).toHaveLength(2);
    expect((result as any).deals[0].id).toBe("hs-deal:401");
    expect((result as any).deals[0].name).toBe("Enterprise License");
    expect((result as any).total).toBe(2);
  });

  it("throws CONNECTOR_UPSTREAM_ERROR on 400", async () => {
    const result = searchDeals({ accessToken: "tok", fetch: createUpstreamErrorFetch(400) });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("searchTickets action", () => {
  it("validates input without accessToken", () => {
    const result = searchTickets({ query: "login" });
    expect(result.action).toBe("tickets.search");
    expect((result as any).validated.query).toBe("login");
  });

  it("searches tickets with accessToken", async () => {
    const captured: { url?: string; method?: string; body?: string } = {};
    const result = await searchTickets({
      accessToken: "tok-abc",
      query: "login",
      fetch: capturingJsonFetch(200, searchTicketsFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/objects/tickets/search");
    expect(captured.method).toBe("POST");
    expect((result as any).tickets).toHaveLength(2);
    expect((result as any).tickets[0].id).toBe("hs-ticket:501");
    expect((result as any).tickets[0].subject).toBe("Login not working");
  });
});

describe("createNote action", () => {
  it("validates input without accessToken", () => {
    const result = createNote({ body: "Followed up with Alice.", timestamp: "1717236000000" });
    expect(result.action).toBe("engagements.notes.create");
    expect((result as any).validated.body).toBe("Followed up with Alice.");
  });

  it("throws when body is missing", () => {
    expect(() => createNote({})).toThrow("body is required");
  });

  it("creates a note with accessToken", async () => {
    const captured: { url?: string; method?: string; auth?: string; body?: string } = {};
    const result = await createNote({
      accessToken: "tok-abc",
      body: "Followed up with Alice about the enterprise expansion.",
      timestamp: "1717236000000",
      ownerId: "42",
      fetch: capturingJsonFetch(201, createNoteFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/objects/notes");
    expect(captured.method).toBe("POST");
    expect(captured.auth).toBe("Bearer tok-abc");
    const payload = JSON.parse(captured.body ?? "{}");
    expect(payload.properties.hs_note_body).toBe("Followed up with Alice about the enterprise expansion.");
    expect(payload.properties.hs_timestamp).toBe("1717236000000");
    expect(payload.properties.hubspot_owner_id).toBe("42");
    expect((result as any).note.id).toBe("hs-note:1101");
    expect((result as any).note.body).toBe("Followed up with Alice about the enterprise expansion.");
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = createNote({ accessToken: "tok", body: "note", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("createMeeting action", () => {
  it("validates input without accessToken", () => {
    const result = createMeeting({ title: "Discovery call", timestamp: "1717236000000" });
    expect(result.action).toBe("engagements.meetings.create");
    expect((result as any).validated.title).toBe("Discovery call");
  });

  it("throws when title is missing", () => {
    expect(() => createMeeting({ timestamp: "1" })).toThrow("title is required");
  });

  it("creates a meeting with accessToken", async () => {
    const captured: { url?: string; method?: string; body?: string } = {};
    const result = await createMeeting({
      accessToken: "tok-abc",
      title: "Discovery call",
      body: "Walk through requirements.",
      timestamp: "1717236000000",
      startTime: "1717236000000",
      endTime: "1717239600000",
      fetch: capturingJsonFetch(201, createMeetingFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/objects/meetings");
    expect(captured.method).toBe("POST");
    const payload = JSON.parse(captured.body ?? "{}");
    expect(payload.properties.hs_meeting_title).toBe("Discovery call");
    expect(payload.properties.hs_meeting_start_time).toBe("1717236000000");
    expect((result as any).meeting.id).toBe("hs-meeting:1201");
    expect((result as any).meeting.title).toBe("Discovery call");
  });
});

describe("createCall action", () => {
  it("validates input without accessToken", () => {
    const result = createCall({ title: "Intro call", timestamp: "1717236000000" });
    expect(result.action).toBe("engagements.calls.create");
    expect((result as any).validated.title).toBe("Intro call");
  });

  it("throws when title is missing", () => {
    expect(() => createCall({})).toThrow("title is required");
  });

  it("creates a call with accessToken", async () => {
    const captured: { url?: string; method?: string; body?: string } = {};
    const result = await createCall({
      accessToken: "tok-abc",
      title: "Intro call",
      body: "Discussed timeline.",
      timestamp: "1717236000000",
      durationMs: 600000,
      status: "completed",
      direction: "outbound",
      fetch: capturingJsonFetch(201, createCallFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/objects/calls");
    expect(captured.method).toBe("POST");
    const payload = JSON.parse(captured.body ?? "{}");
    expect(payload.properties.hs_call_title).toBe("Intro call");
    expect(payload.properties.hs_call_duration).toBe("600000");
    expect(payload.properties.hs_call_status).toBe("COMPLETED");
    expect(payload.properties.hs_call_direction).toBe("OUTBOUND");
    expect((result as any).call.id).toBe("hs-call:1301");
  });
});

describe("createTask action", () => {
  it("validates input without accessToken", () => {
    const result = createTask({ subject: "Send proposal" });
    expect(result.action).toBe("engagements.tasks.create");
    expect((result as any).validated.subject).toBe("Send proposal");
  });

  it("throws when subject is missing", () => {
    expect(() => createTask({})).toThrow("subject is required");
  });

  it("creates a task with accessToken", async () => {
    const captured: { url?: string; method?: string; body?: string } = {};
    const result = await createTask({
      accessToken: "tok-abc",
      subject: "Send proposal",
      body: "Attach pricing sheet.",
      timestamp: "1717322400000",
      status: "not_started",
      priority: "high",
      type: "todo",
      fetch: capturingJsonFetch(201, createTaskFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/objects/tasks");
    expect(captured.method).toBe("POST");
    const payload = JSON.parse(captured.body ?? "{}");
    expect(payload.properties.hs_task_subject).toBe("Send proposal");
    expect(payload.properties.hs_task_status).toBe("NOT_STARTED");
    expect(payload.properties.hs_task_priority).toBe("HIGH");
    expect(payload.properties.hs_task_type).toBe("TODO");
    expect((result as any).task.id).toBe("hs-task:1401");
    expect((result as any).task.subject).toBe("Send proposal");
  });
});

describe("listOwners action", () => {
  it("validates input without accessToken", () => {
    const result = listOwners({ limit: 50, email: "alice@example.com" });
    expect(result.action).toBe("owners.list");
    expect((result as any).validated.limit).toBe(50);
    expect((result as any).validated.email).toBe("alice@example.com");
  });

  it("lists owners with accessToken", async () => {
    const captured: { url?: string; method?: string; auth?: string } = {};
    const result = await listOwners({
      accessToken: "tok-abc",
      limit: 50,
      after: "10",
      fetch: capturingJsonFetch(200, ownersListFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/owners?limit=50&after=10");
    expect(captured.method).toBe("GET");
    expect(captured.auth).toBe("Bearer tok-abc");
    expect((result as any).owners).toHaveLength(2);
    expect((result as any).owners[0].id).toBe("hs-owner:42");
    expect((result as any).owners[0].email).toBe("alice@example.com");
    expect((result as any).nextCursor).toBe("43");
  });

  it("throws CONNECTOR_RATE_LIMITED on 429", async () => {
    const result = listOwners({ accessToken: "tok", fetch: createRateLimitFetch() });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("listDealPipelines action", () => {
  it("validates input without accessToken", () => {
    const result = listDealPipelines({});
    expect(result.action).toBe("pipelines.deals.list");
  });

  it("lists deal pipelines with accessToken", async () => {
    const captured: { url?: string; method?: string; auth?: string } = {};
    const result = await listDealPipelines({
      accessToken: "tok-abc",
      fetch: capturingJsonFetch(200, pipelinesDealsFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v3/pipelines/deals");
    expect(captured.method).toBe("GET");
    expect(captured.auth).toBe("Bearer tok-abc");
    expect((result as any).pipelines).toHaveLength(1);
    expect((result as any).pipelines[0].id).toBe("default");
    expect((result as any).pipelines[0].label).toBe("Sales Pipeline");
    expect((result as any).pipelines[0].stages).toHaveLength(2);
  });
});

describe("createAssociation action", () => {
  it("validates input without accessToken", () => {
    const result = createAssociation({
      fromObjectType: "contacts",
      fromId: "601",
      toObjectType: "companies",
      toId: "701",
      associationTypeId: 1,
    });
    expect(result.action).toBe("associations.create");
    expect((result as any).validated.fromObjectType).toBe("contacts");
    expect((result as any).validated.associationTypeId).toBe(1);
  });

  it("throws when required fields are missing", () => {
    expect(() => createAssociation({ fromObjectType: "contacts" })).toThrow("fromId is required");
  });

  it("creates an association with accessToken", async () => {
    const captured: { url?: string; method?: string; auth?: string; body?: string } = {};
    const result = await createAssociation({
      accessToken: "tok-abc",
      fromObjectType: "contacts",
      fromId: "601",
      toObjectType: "companies",
      toId: "701",
      associationTypeId: 1,
      fetch: capturingJsonFetch(201, createAssociationFixture, captured),
    });
    expect(captured.url).toBe("https://api.hubapi.com/crm/v4/objects/contacts/601/associations/companies/701");
    expect(captured.method).toBe("PUT");
    expect(captured.auth).toBe("Bearer tok-abc");
    const payload = JSON.parse(captured.body ?? "[]");
    expect(payload).toEqual([{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 }]);
    expect((result as any).association.fromId).toBe("601");
    expect((result as any).association.toId).toBe("701");
  });

  it("throws CONNECTOR_UPSTREAM_ERROR on 400", async () => {
    const result = createAssociation({
      accessToken: "tok",
      fromObjectType: "contacts",
      fromId: "601",
      toObjectType: "companies",
      toId: "701",
      associationTypeId: 1,
      fetch: createUpstreamErrorFetch(400),
    });
    await expect(result as Promise<unknown>).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
