import { describe, expect, it, mock } from "bun:test";
import updateListFixture from "../fixtures/update_list.json";
import createMemberNoteFixture from "../fixtures/create_member_note.json";
import replicateCampaignFixture from "../fixtures/replicate_campaign.json";
import templatesListFixture from "../fixtures/templates_list.json";
import getTemplateFixture from "../fixtures/get_template.json";
import reportsSummaryFixture from "../fixtures/reports_summary.json";
import reportsOpensFixture from "../fixtures/reports_opens.json";
import reportsClicksFixture from "../fixtures/reports_clicks.json";
import reportsUnsubscribedFixture from "../fixtures/reports_unsubscribed.json";
import automationsListFixture from "../fixtures/automations_list.json";
import getAutomationFixture from "../fixtures/get_automation.json";
import * as httpModule from "../src/http";

type FetchCall = { path: string; method: string; body?: unknown };
let fetchCalls: FetchCall[] = [];
let mockStatus = 200;
let mockResponseBody: unknown = {};

const mockFetchJSONImpl = mock(async (path: string, init: RequestInit = {}) => {
  let body: unknown;
  try { body = JSON.parse((init.body as string) ?? "{}"); } catch { body = init.body; }
  fetchCalls.push({ path, method: init.method ?? "GET", body });
  return { status: mockStatus, headers: {} as Record<string, string>, body: mockResponseBody };
});

mock.module("../src/http", () => ({
  ...httpModule,
  createMailchimpClient: (_opts: unknown) => ({ fetchJSON: mockFetchJSONImpl }),
}));

import {
  unscheduleCampaign,
  scheduleCampaign,
  deleteCampaign,
  replicateCampaign,
  updateList,
  deleteList,
  createMemberNote,
  listTemplates,
  getTemplate,
  getReportSummary,
  getReportOpens,
  getReportClicks,
  getReportUnsubscribed,
  listAutomations,
  getAutomation,
} from "../src/actions";

const API_KEY = "fixture-mailchimp-key";

function resetMocks(status: number, body: unknown) {
  fetchCalls = [];
  mockStatus = status;
  mockResponseBody = body;
  mockFetchJSONImpl.mockClear();
}

describe("unscheduleCampaign action", () => {
  it("validates input without apiKey", () => {
    const result = unscheduleCampaign({ campaignId: "camp001" });
    expect((result as any).action).toBe("campaigns.unschedule");
    expect((result as any).validated.campaignId).toBe("camp001");
  });

  it("throws when campaignId is missing", () => {
    expect(() => unscheduleCampaign({})).toThrow("campaignId is required");
  });

  it("unschedules a campaign via POST /actions/unschedule", async () => {
    resetMocks(204, null);
    const result = await unscheduleCampaign({ apiKey: API_KEY, campaignId: "camp001" });
    expect(result.action).toBe("campaigns.unschedule");
    expect((result as any).unscheduled).toBe(true);
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].path).toBe("/campaigns/camp001/actions/unschedule");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(unscheduleCampaign({ apiKey: API_KEY, campaignId: "camp001" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(unscheduleCampaign({ apiKey: API_KEY, campaignId: "missing" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("scheduleCampaign action", () => {
  it("validates input without apiKey", () => {
    const result = scheduleCampaign({ campaignId: "camp001", scheduleTime: "2026-06-01T08:00:00Z" });
    expect((result as any).action).toBe("campaigns.schedule");
    expect((result as any).validated.scheduleTime).toBe("2026-06-01T08:00:00Z");
  });

  it("throws when scheduleTime is missing", () => {
    expect(() => scheduleCampaign({ campaignId: "camp001" })).toThrow("scheduleTime is required");
  });

  it("schedules a campaign via POST /actions/schedule", async () => {
    resetMocks(204, null);
    const result = await scheduleCampaign({
      apiKey: API_KEY,
      campaignId: "camp001",
      scheduleTime: "2026-06-01T08:00:00Z",
    });
    expect((result as any).scheduled).toBe(true);
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].path).toBe("/campaigns/camp001/actions/schedule");
    expect((fetchCalls[0].body as any).schedule_time).toBe("2026-06-01T08:00:00Z");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(scheduleCampaign({
      apiKey: API_KEY,
      campaignId: "camp001",
      scheduleTime: "2026-06-01T08:00:00Z",
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("deleteCampaign action", () => {
  it("validates input without apiKey", () => {
    const result = deleteCampaign({ campaignId: "camp001" });
    expect((result as any).action).toBe("campaigns.delete");
  });

  it("throws when campaignId is missing", () => {
    expect(() => deleteCampaign({})).toThrow("campaignId is required");
  });

  it("deletes a campaign", async () => {
    resetMocks(204, null);
    const result = await deleteCampaign({ apiKey: API_KEY, campaignId: "camp001" });
    expect((result as any).deleted).toBe(true);
    expect(fetchCalls[0].method).toBe("DELETE");
    expect(fetchCalls[0].path).toBe("/campaigns/camp001");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(deleteCampaign({ apiKey: API_KEY, campaignId: "missing" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("replicateCampaign action", () => {
  it("validates input without apiKey", () => {
    const result = replicateCampaign({ campaignId: "camp001" });
    expect((result as any).action).toBe("campaigns.replicate");
  });

  it("replicates a campaign", async () => {
    resetMocks(200, replicateCampaignFixture);
    const result = await replicateCampaign({ apiKey: API_KEY, campaignId: "camp001" });
    expect((result as any).campaign.providerCampaignId).toBe("camp002");
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].path).toBe("/campaigns/camp001/actions/replicate");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(replicateCampaign({ apiKey: API_KEY, campaignId: "camp001" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("updateList action", () => {
  it("validates input without apiKey", () => {
    const result = updateList({ listId: "list001", name: "Updated Newsletter" });
    expect((result as any).action).toBe("lists.update");
    expect((result as any).validated.name).toBe("Updated Newsletter");
  });

  it("throws when listId is missing", () => {
    expect(() => updateList({ name: "X" })).toThrow("listId is required");
  });

  it("patches a list", async () => {
    resetMocks(200, updateListFixture);
    const result = await updateList({ apiKey: API_KEY, listId: "list001", name: "Updated Newsletter" });
    expect((result as any).audience.name).toBe("Updated Newsletter");
    expect(fetchCalls[0].method).toBe("PATCH");
    expect(fetchCalls[0].path).toBe("/lists/list001");
    expect((fetchCalls[0].body as any).name).toBe("Updated Newsletter");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(updateList({ apiKey: API_KEY, listId: "missing" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("deleteList action", () => {
  it("validates input without apiKey", () => {
    const result = deleteList({ listId: "list001" });
    expect((result as any).action).toBe("lists.delete");
  });

  it("throws when listId is missing", () => {
    expect(() => deleteList({})).toThrow("listId is required");
  });

  it("deletes a list", async () => {
    resetMocks(204, null);
    const result = await deleteList({ apiKey: API_KEY, listId: "list001" });
    expect((result as any).deleted).toBe(true);
    expect(fetchCalls[0].method).toBe("DELETE");
    expect(fetchCalls[0].path).toBe("/lists/list001");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(deleteList({ apiKey: API_KEY, listId: "list001" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("createMemberNote action", () => {
  it("validates input without apiKey", () => {
    const result = createMemberNote({ listId: "list001", email: "member@example.com", note: "VIP" });
    expect((result as any).action).toBe("members.notes.create");
    expect((result as any).validated.note).toBe("VIP");
  });

  it("throws when note is missing", () => {
    expect(() => createMemberNote({ listId: "list001", email: "a@b.com" })).toThrow("note is required");
  });

  it("creates a member note", async () => {
    resetMocks(200, createMemberNoteFixture);
    const result = await createMemberNote({
      apiKey: API_KEY,
      listId: "list001",
      email: "member@example.com",
      note: "VIP customer — follow up after launch.",
    });
    expect((result as any).note.note).toBe("VIP customer — follow up after launch.");
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].path).toContain("/lists/list001/members/");
    expect(fetchCalls[0].path).toContain("/notes");
    expect((fetchCalls[0].body as any).note).toBe("VIP customer — follow up after launch.");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(createMemberNote({
      apiKey: API_KEY,
      listId: "list001",
      email: "gone@example.com",
      note: "x",
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listTemplates action", () => {
  it("validates input without apiKey", () => {
    const result = listTemplates({});
    expect((result as any).action).toBe("templates.list");
  });

  it("lists templates", async () => {
    resetMocks(200, templatesListFixture);
    const result = await listTemplates({ apiKey: API_KEY });
    expect((result as any).templates).toHaveLength(1);
    expect((result as any).templates[0].name).toBe("Newsletter Base");
    expect(fetchCalls[0].method).toBe("GET");
    expect(fetchCalls[0].path).toBe("/templates");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(listTemplates({ apiKey: API_KEY }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("getTemplate action", () => {
  it("validates input without apiKey", () => {
    const result = getTemplate({ templateId: "1001" });
    expect((result as any).action).toBe("templates.get");
    expect((result as any).validated.templateId).toBe("1001");
  });

  it("throws when templateId is missing", () => {
    expect(() => getTemplate({})).toThrow("templateId is required");
  });

  it("fetches a template", async () => {
    resetMocks(200, getTemplateFixture);
    const result = await getTemplate({ apiKey: API_KEY, templateId: "1001" });
    expect((result as any).template.name).toBe("Newsletter Base");
    expect(fetchCalls[0].path).toBe("/templates/1001");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(getTemplate({ apiKey: API_KEY, templateId: "missing" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("getReportSummary action", () => {
  it("validates input without apiKey", () => {
    const result = getReportSummary({ campaignId: "camp001" });
    expect((result as any).action).toBe("reports.summary");
  });

  it("throws when campaignId is missing", () => {
    expect(() => getReportSummary({})).toThrow("campaignId is required");
  });

  it("fetches a campaign report summary", async () => {
    resetMocks(200, reportsSummaryFixture);
    const result = await getReportSummary({ apiKey: API_KEY, campaignId: "camp001" });
    expect((result as any).report.emailsSent).toBe(5000);
    expect((result as any).report.openRate).toBe(0.36);
    expect(fetchCalls[0].path).toBe("/reports/camp001");
    expect(fetchCalls[0].method).toBe("GET");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(getReportSummary({ apiKey: API_KEY, campaignId: "missing" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("getReportOpens action", () => {
  it("validates input without apiKey", () => {
    const result = getReportOpens({ campaignId: "camp001" });
    expect((result as any).action).toBe("reports.opens");
  });

  it("fetches open details", async () => {
    resetMocks(200, reportsOpensFixture);
    const result = await getReportOpens({ apiKey: API_KEY, campaignId: "camp001" });
    expect((result as any).opens).toHaveLength(1);
    expect((result as any).opens[0].email).toBe("jane@example.com");
    expect(fetchCalls[0].path).toBe("/reports/camp001/open-details");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(getReportOpens({ apiKey: API_KEY, campaignId: "camp001" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("getReportClicks action", () => {
  it("validates input without apiKey", () => {
    const result = getReportClicks({ campaignId: "camp001" });
    expect((result as any).action).toBe("reports.clicks");
  });

  it("fetches click details", async () => {
    resetMocks(200, reportsClicksFixture);
    const result = await getReportClicks({ apiKey: API_KEY, campaignId: "camp001" });
    expect((result as any).clicks[0].url).toBe("https://example.com/sale");
    expect(fetchCalls[0].path).toBe("/reports/camp001/click-details");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(getReportClicks({ apiKey: API_KEY, campaignId: "missing" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("getReportUnsubscribed action", () => {
  it("validates input without apiKey", () => {
    const result = getReportUnsubscribed({ campaignId: "camp001" });
    expect((result as any).action).toBe("reports.unsubscribed");
  });

  it("fetches unsubscribed members", async () => {
    resetMocks(200, reportsUnsubscribedFixture);
    const result = await getReportUnsubscribed({ apiKey: API_KEY, campaignId: "camp001" });
    expect((result as any).unsubscribed[0].email).toBe("gone@example.com");
    expect(fetchCalls[0].path).toBe("/reports/camp001/unsubscribed");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(getReportUnsubscribed({ apiKey: API_KEY, campaignId: "camp001" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("listAutomations action", () => {
  it("validates input without apiKey", () => {
    const result = listAutomations({});
    expect((result as any).action).toBe("automations.list");
  });

  it("lists automations", async () => {
    resetMocks(200, automationsListFixture);
    const result = await listAutomations({ apiKey: API_KEY });
    expect((result as any).automations[0].title).toBe("Welcome Journey");
    expect(fetchCalls[0].method).toBe("GET");
    expect(fetchCalls[0].path).toBe("/automations");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(listAutomations({ apiKey: API_KEY }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("getAutomation action", () => {
  it("validates input without apiKey", () => {
    const result = getAutomation({ automationId: "auto001" });
    expect((result as any).action).toBe("automations.get");
  });

  it("throws when automationId is missing", () => {
    expect(() => getAutomation({})).toThrow("automationId is required");
  });

  it("fetches an automation", async () => {
    resetMocks(200, getAutomationFixture);
    const result = await getAutomation({ apiKey: API_KEY, automationId: "auto001" });
    expect((result as any).automation.providerAutomationId).toBe("auto001");
    expect(fetchCalls[0].path).toBe("/automations/auto001");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(getAutomation({ apiKey: API_KEY, automationId: "missing" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
