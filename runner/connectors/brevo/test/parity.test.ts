import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import accountGetFixture from "../fixtures/account_get.json";
import companiesCreateFixture from "../fixtures/companies_create.json";
import companiesGetFixture from "../fixtures/companies_get.json";
import companiesListFixture from "../fixtures/companies_list.json";
import contactAttributesFixture from "../fixtures/contact_attributes.json";
import contactCampaignStatsFixture from "../fixtures/contact_campaign_stats.json";
import crmNotesListFixture from "../fixtures/crm_notes_list.json";
import customObjectRecordsFixture from "../fixtures/custom_object_records.json";
import importContactsFixture from "../fixtures/import_contacts.json";
import senderDomainsFixture from "../fixtures/sender_domains.json";
import sendersListFixture from "../fixtures/senders_list.json";
import smsCampaignCreateFixture from "../fixtures/sms_campaign_create.json";
import smsCampaignGetFixture from "../fixtures/sms_campaign_get.json";
import smsCampaignsListFixture from "../fixtures/sms_campaigns_list.json";
import smtpEventsFixture from "../fixtures/smtp_events.json";
import smtpTemplateCreateFixture from "../fixtures/smtp_template_create.json";
import smtpTemplateGetFixture from "../fixtures/smtp_template_get.json";
import smtpTemplatesListFixture from "../fixtures/smtp_templates_list.json";
import { appendQuery } from "../src/http";
import {
  brevoParityActions,
  createCompany,
  createOrUpdateEmailTemplate,
  createSmsCampaign,
  deleteCompany,
  deleteEmailTemplate,
  deleteSmsCampaign,
  getAccountInfo,
  getCompany,
  getContactCampaignStats,
  getEmailTemplate,
  getSmsCampaign,
  importContacts,
  listCompanies,
  listContactAttributes,
  listCrmNotes,
  listCustomObjectRecords,
  listEmailTemplates,
  listSenderDomains,
  listSenders,
  listSmsCampaigns,
  listTransactionalEmailEvents,
  updateEmailCampaign,
} from "../src/parity";

const COMPOSIO_TOOL_MAP: Record<string, string> = {
  BREVO_CREATE_A_COMPANY: "companies.create",
  BREVO_CREATE_CONTACT: "contacts.create",
  BREVO_CREATE_CONTACT_LIST: "lists.create",
  BREVO_CREATE_EMAIL_CAMPAIGN: "emailCampaigns.create",
  BREVO_CREATE_OR_UPDATE_EMAIL_TEMPLATE: "smtp.templates.createOrUpdate",
  BREVO_CREATE_SMS_CAMPAIGN: "smsCampaigns.create",
  BREVO_DELETE_COMPANY: "companies.delete",
  BREVO_DELETE_CONTACT: "contacts.delete",
  BREVO_DELETE_EMAIL_TEMPLATE: "smtp.templates.delete",
  BREVO_DELETE_SMS_CAMPAIGN: "smsCampaigns.delete",
  BREVO_GET_ACCOUNT_INFO: "account.get",
  BREVO_GET_ALL_CONTACTS: "contacts.list",
  BREVO_GET_ALL_EMAIL_TEMPLATES: "smtp.templates.list",
  BREVO_GET_ALL_SENDERS: "senders.list",
  BREVO_GET_COMPANY_DETAILS: "companies.get",
  BREVO_GET_CONTACT_CAMPAIGN_STATS: "contacts.campaignStats.get",
  BREVO_GET_CONTACT_DETAILS: "contacts.get",
  BREVO_GET_CONTACT_LIST: "lists.get",
  BREVO_GET_CONTACT_LISTS: "lists.list",
  BREVO_GET_EMAIL_CAMPAIGN_DETAILS: "emailCampaigns.get",
  BREVO_GET_EMAIL_TEMPLATE: "smtp.templates.get",
  BREVO_GET_SMS_CAMPAIGN_DETAILS: "smsCampaigns.get",
  BREVO_GET_SMS_CAMPAIGNS: "smsCampaigns.list",
  BREVO_IMPORT_CONTACTS: "contacts.import",
  BREVO_LIST_ALL_COMPANIES: "companies.list",
  BREVO_LIST_CONTACT_ATTRIBUTES: "contacts.attributes.list",
  BREVO_LIST_CRM_NOTES: "crm.notes.list",
  BREVO_LIST_CUSTOM_OBJECT_RECORDS: "crm.objects.records.list",
  BREVO_LIST_EMAIL_CAMPAIGNS: "campaigns.list",
  BREVO_LIST_SENDER_DOMAINS: "senders.domains.list",
  BREVO_LIST_TRANSACTIONAL_EMAIL_EVENTS: "smtp.events.list",
  BREVO_SEND_EMAIL_CAMPAIGN_NOW: "emailCampaigns.send",
  BREVO_SEND_TRANSACTIONAL_EMAIL: "smtp.email.send",
  BREVO_UPDATE_CONTACT: "contacts.update",
  BREVO_UPDATE_EMAIL_CAMPAIGN: "emailCampaigns.update",
};

const NEW_OPS = [
  "account.get",
  "companies.create",
  "companies.get",
  "companies.delete",
  "companies.list",
  "smtp.templates.createOrUpdate",
  "smtp.templates.delete",
  "smtp.templates.list",
  "smtp.templates.get",
  "smsCampaigns.create",
  "smsCampaigns.delete",
  "smsCampaigns.get",
  "smsCampaigns.list",
  "contacts.campaignStats.get",
  "contacts.import",
  "contacts.attributes.list",
  "crm.notes.list",
  "crm.objects.records.list",
  "senders.list",
  "senders.domains.list",
  "smtp.events.list",
  "emailCampaigns.update",
] as const;

function recordFetch(status: number, body: unknown, store: Request[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    store.push(req);
    if (body === null) return new Response(null, { status });
    return Response.json(body, { status });
  };
}

describe("appendQuery", () => {
  test("omits empty query objects", () => {
    expect(appendQuery("/senders", {})).toBe("/senders");
  });

  test("encodes scalars, booleans, and repeated array values", () => {
    expect(appendQuery("/companies", {
      limit: 50,
      association: true,
      linkedContactsIds: [1, 2],
    })).toBe("/companies?limit=50&association=true&linkedContactsIds=1&linkedContactsIds=2");
  });
});

describe("composio inventory", () => {
  test("maps all 35 current Composio BREVO tools onto real operations", () => {
    expect(Object.keys(COMPOSIO_TOOL_MAP)).toHaveLength(35);
    for (const [tool, operation] of Object.entries(COMPOSIO_TOOL_MAP)) {
      expect(manifest.operations[operation as keyof typeof manifest.operations], tool).toBeDefined();
    }
  });

  test("registers a handwritten handler for every newly added Composio operation", () => {
    for (const op of NEW_OPS) {
      expect(typeof brevoParityActions[op]).toBe("function");
    }
  });
});

describe("account.get", () => {
  test("validates empty input without apiKey", () => {
    expect(getAccountInfo({})).toEqual({
      connector: "brevo",
      action: "account.get",
      source: "connector",
      validated: {},
    });
  });

  test("GETs /v3/account", async () => {
    const requests: Request[] = [];
    const result = await getAccountInfo({
      apiKey: "test-key",
      fetch: recordFetch(200, accountGetFixture, requests),
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/account");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("api-key")).toBe("test-key");
    expect(result).toMatchObject({ action: "account.get", data: accountGetFixture });
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
});

describe("companies", () => {
  test("createCompany requires name", () => {
    expect(() => createCompany({ apiKey: "key" })).toThrow("name is required");
  });

  test("POSTs /v3/companies", async () => {
    const requests: Request[] = [];
    const result = await createCompany({
      apiKey: "key",
      name: "Acme",
      attributes: { domain: "acme.example" },
      linkedContactsIds: [1],
      fetch: recordFetch(200, companiesCreateFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/companies");
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toEqual({
      name: "Acme",
      attributes: { domain: "acme.example" },
      linkedContactsIds: [1],
    });
    expect(result).toMatchObject({ action: "companies.create", data: companiesCreateFixture });
  });

  test("getCompany GETs /v3/companies/{id}", async () => {
    const requests: Request[] = [];
    const result = await getCompany({
      apiKey: "key",
      id: "629475917295261d9b1f4403",
      fetch: recordFetch(200, companiesGetFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/companies/629475917295261d9b1f4403");
    expect(result).toMatchObject({ action: "companies.get", data: companiesGetFixture });
  });

  test("deleteCompany DELETEs /v3/companies/{id}", async () => {
    const requests: Request[] = [];
    const result = await deleteCompany({
      apiKey: "key",
      id: "629475917295261d9b1f4403",
      fetch: recordFetch(204, null, requests),
    });
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toBe("https://api.brevo.com/v3/companies/629475917295261d9b1f4403");
    expect(result).toEqual({
      connector: "brevo",
      action: "companies.delete",
      source: "connector",
      deleted: true,
    });
  });

  test("listCompanies expands JSON filters and repeats linked ids", async () => {
    const requests: Request[] = [];
    const result = await listCompanies({
      apiKey: "key",
      filters: JSON.stringify({ "attributes.name": "Acme" }),
      limit: 50,
      linkedContactsIds: [9, 8],
      fetch: recordFetch(200, companiesListFixture, requests),
    });
    const url = new URL(requests[0].url);
    expect(url.origin + url.pathname).toBe("https://api.brevo.com/v3/companies");
    expect(url.searchParams.get("filters[attributes.name]")).toBe("Acme");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.getAll("linkedContactsIds")).toEqual(["9", "8"]);
    expect(result).toMatchObject({ action: "companies.list", data: companiesListFixture });
  });
});

describe("smtp templates", () => {
  test("create path POSTs /v3/smtp/templates", async () => {
    const requests: Request[] = [];
    const result = await createOrUpdateEmailTemplate({
      apiKey: "key",
      templateName: "Order Confirmation - EN",
      subject: "Thanks for your purchase !",
      sender: { email: "hello@example.com", name: "Acme" },
      htmlContent: "<p>Thanks for your order</p>",
      fetch: recordFetch(201, smtpTemplateCreateFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smtp/templates");
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toMatchObject({
      templateName: "Order Confirmation - EN",
      subject: "Thanks for your purchase !",
      htmlContent: "<p>Thanks for your order</p>",
    });
    expect(result).toMatchObject({ action: "smtp.templates.createOrUpdate", data: smtpTemplateCreateFixture });
  });

  test("update path PUTs /v3/smtp/templates/{templateId}", async () => {
    const requests: Request[] = [];
    const result = await createOrUpdateEmailTemplate({
      apiKey: "key",
      templateId: 12,
      subject: "Updated subject",
      htmlContent: "<p>Updated copy</p>",
      fetch: recordFetch(204, null, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smtp/templates/12");
    expect(requests[0].method).toBe("PUT");
    expect(result).toMatchObject({ action: "smtp.templates.createOrUpdate", updated: true });
  });

  test("create requires templateName, subject, and sender", () => {
    expect(() => createOrUpdateEmailTemplate({ apiKey: "key", htmlContent: "<p>hello there</p>" }))
      .toThrow("templateName is required");
  });

  test("listEmailTemplates GETs /v3/smtp/templates with filters", async () => {
    const requests: Request[] = [];
    await listEmailTemplates({
      apiKey: "key",
      limit: 50,
      templateStatus: true,
      sort: "desc",
      fetch: recordFetch(200, smtpTemplatesListFixture, requests),
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v3/smtp/templates");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("templateStatus")).toBe("true");
  });

  test("getEmailTemplate encodes custom ids", async () => {
    const requests: Request[] = [];
    const result = await getEmailTemplate({
      apiKey: "key",
      template_id: "welcome-en",
      fetch: recordFetch(200, smtpTemplateGetFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smtp/templates/welcome-en");
    expect(result).toMatchObject({ action: "smtp.templates.get", data: smtpTemplateGetFixture });
  });

  test("deleteEmailTemplate DELETEs /v3/smtp/templates/{id}", async () => {
    const requests: Request[] = [];
    const result = await deleteEmailTemplate({
      apiKey: "key",
      template_id: 12,
      fetch: recordFetch(204, null, requests),
    });
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smtp/templates/12");
    expect(result).toMatchObject({ deleted: true });
  });
});

describe("sms campaigns", () => {
  test("createSmsCampaign POSTs /v3/smsCampaigns", async () => {
    const requests: Request[] = [];
    const result = await createSmsCampaign({
      apiKey: "key",
      name: "Spring Promo Code",
      sender: "MyShop",
      content: "Happy Spring!",
      recipients: { listIds: [2], segmentIds: [9] },
      fetch: recordFetch(201, smsCampaignCreateFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smsCampaigns");
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toMatchObject({
      name: "Spring Promo Code",
      sender: "MyShop",
      content: "Happy Spring!",
      recipients: { listIds: [2], segmentIds: [9] },
    });
    expect(result).toMatchObject({ data: smsCampaignCreateFixture });
  });

  test("getSmsCampaign uses campaign_id alias", async () => {
    const requests: Request[] = [];
    await getSmsCampaign({
      apiKey: "key",
      campaign_id: 5,
      fetch: recordFetch(200, smsCampaignGetFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smsCampaigns/5");
  });

  test("listSmsCampaigns filters by status and dates", async () => {
    const requests: Request[] = [];
    await listSmsCampaigns({
      apiKey: "key",
      status: "draft",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-01-31T00:00:00.000Z",
      fetch: recordFetch(200, smsCampaignsListFixture, requests),
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v3/smsCampaigns");
    expect(url.searchParams.get("status")).toBe("draft");
    expect(url.searchParams.get("startDate")).toBe("2026-01-01T00:00:00.000Z");
  });

  test("deleteSmsCampaign DELETEs by campaign_id", async () => {
    const requests: Request[] = [];
    const result = await deleteSmsCampaign({
      apiKey: "key",
      campaign_id: 5,
      fetch: recordFetch(204, null, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smsCampaigns/5");
    expect(result).toMatchObject({ deleted: true });
  });
});

describe("contacts extras", () => {
  test("getContactCampaignStats URL-encodes the identifier", async () => {
    const requests: Request[] = [];
    const result = await getContactCampaignStats({
      apiKey: "key",
      identifier: "ada@example.com",
      start_date: "2026-01-01",
      end_date: "2026-01-15",
      fetch: recordFetch(200, contactCampaignStatsFixture, requests),
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v3/contacts/ada%40example.com/campaignStats");
    expect(url.searchParams.get("startDate")).toBe("2026-01-01");
    expect(url.searchParams.get("endDate")).toBe("2026-01-15");
    expect(result).toMatchObject({ data: contactCampaignStatsFixture });
  });

  test("getContactCampaignStats requires start and end together", () => {
    expect(() => getContactCampaignStats({ identifier: "ada@example.com", start_date: "2026-01-01" }))
      .toThrow("start_date and end_date must be provided together");
  });

  test("importContacts maps snake_case onto the official body", async () => {
    const requests: Request[] = [];
    const result = await importContacts({
      apiKey: "key",
      file_url: "https://files.example.com/contacts.csv",
      list_ids: [2, 4],
      update_existing_contacts: true,
      notify_url: "https://hooks.example.com/brevo",
      fetch: recordFetch(202, importContactsFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/import");
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toEqual({
      fileUrl: "https://files.example.com/contacts.csv",
      listIds: [2, 4],
      updateExistingContacts: true,
      notifyUrl: "https://hooks.example.com/brevo",
    });
    expect(result).toMatchObject({ data: importContactsFixture });
  });

  test("importContacts requires a file source and a destination list", () => {
    expect(() => importContacts({ apiKey: "key", list_ids: [1] }))
      .toThrow("file_url, file_body, or json_body is required");
    expect(() => importContacts({ apiKey: "key", file_url: "https://files.example.com/a.csv" }))
      .toThrow("list_ids or new_list is required");
  });

  test("listContactAttributes GETs /v3/contacts/attributes", async () => {
    const requests: Request[] = [];
    const result = await listContactAttributes({
      apiKey: "key",
      fetch: recordFetch(200, contactAttributesFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/attributes");
    expect(result).toMatchObject({ data: contactAttributesFixture });
  });
});

describe("crm, senders, events, campaign update", () => {
  test("listCrmNotes maps entity_ids and millisecond dates", async () => {
    const requests: Request[] = [];
    await listCrmNotes({
      apiKey: "key",
      entity: "contacts",
      entity_ids: "247",
      date_from: 1710000000000,
      fetch: recordFetch(200, crmNotesListFixture, requests),
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v3/crm/notes");
    expect(url.searchParams.get("entity")).toBe("contacts");
    expect(url.searchParams.get("entityIds")).toBe("247");
    expect(url.searchParams.get("dateFrom")).toBe("1710000000000");
  });

  test("listCustomObjectRecords requires object_type and uses page_num", async () => {
    expect(() => listCustomObjectRecords({ apiKey: "key" })).toThrow("object_type is required");
    const requests: Request[] = [];
    await listCustomObjectRecords({
      apiKey: "key",
      object_type: "vehicle",
      page_num: 2,
      limit: 0,
      association: true,
      fetch: recordFetch(200, customObjectRecordsFixture, requests),
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v3/objects/vehicle/records");
    expect(url.searchParams.get("page_num")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("0");
    expect(url.searchParams.get("association")).toBe("true");
  });

  test("listSenders and listSenderDomains hit documented paths", async () => {
    const senderReqs: Request[] = [];
    await listSenders({
      apiKey: "key",
      domain: "example.com",
      fetch: recordFetch(200, sendersListFixture, senderReqs),
    });
    expect(new URL(senderReqs[0].url).pathname).toBe("/v3/senders");
    expect(new URL(senderReqs[0].url).searchParams.get("domain")).toBe("example.com");

    const domainReqs: Request[] = [];
    const result = await listSenderDomains({
      apiKey: "key",
      fetch: recordFetch(200, senderDomainsFixture, domainReqs),
    });
    expect(domainReqs[0].url).toBe("https://api.brevo.com/v3/senders/domains");
    expect(result).toMatchObject({ data: senderDomainsFixture });
  });

  test("listTransactionalEmailEvents maps snake_case date and event filters", async () => {
    const requests: Request[] = [];
    await listTransactionalEmailEvents({
      apiKey: "key",
      start_date: "2026-01-01",
      end_date: "2026-01-20",
      event: "delivered",
      template_id: 4,
      fetch: recordFetch(200, smtpEventsFixture, requests),
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v3/smtp/statistics/events");
    expect(url.searchParams.get("startDate")).toBe("2026-01-01");
    expect(url.searchParams.get("endDate")).toBe("2026-01-20");
    expect(url.searchParams.get("event")).toBe("delivered");
    expect(url.searchParams.get("templateId")).toBe("4");
  });

  test("updateEmailCampaign PUTs /v3/emailCampaigns/{id}", async () => {
    const requests: Request[] = [];
    const result = await updateEmailCampaign({
      apiKey: "key",
      campaign_id: 55,
      name: "Renamed campaign",
      html_content: "<p>Updated</p>",
      fetch: recordFetch(204, null, requests),
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.brevo.com/v3/emailCampaigns/55");
    expect(await requests[0].json()).toEqual({
      name: "Renamed campaign",
      htmlContent: "<p>Updated</p>",
    });
    expect(result).toMatchObject({ action: "emailCampaigns.update", updated: true });
  });

  test("rate-limits surface retryAfterSeconds", async () => {
    await expect(getAccountInfo({
      apiKey: "key",
      fetch: async () => new Response("{}", {
        status: 429,
        headers: { "retry-after": "12", "Content-Type": "application/json" },
      }),
    })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 12,
    });
  });

  test("upstream errors use the provider message", async () => {
    await expect(getCompany({
      apiKey: "key",
      id: "missing",
      fetch: async () => new Response(JSON.stringify({ code: "document_not_found", message: "Company not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Company not found (document_not_found)",
    });
  });
});
