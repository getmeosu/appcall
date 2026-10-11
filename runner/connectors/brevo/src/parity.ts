import { createBrevoClient, brevoErrorDetail, parseBrevoRateLimit, isRecord, type BrevoClient, type BrevoFetchInit } from "./http";

type ExecSuccess = { ok: true; value: Record<string, unknown> };
type ExecFailure = { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } };
type ExecResult = ExecSuccess | ExecFailure;

function pick(input: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) return input[key];
  }
  return undefined;
}

function pickString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = pick(input, ...keys);
  return typeof value === "string" ? value : undefined;
}

function pickNumber(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  const value = pick(input, ...keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickBoolean(input: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  const value = pick(input, ...keys);
  return typeof value === "boolean" ? value : undefined;
}

function pickObject(input: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | undefined {
  const value = pick(input, ...keys);
  return isRecord(value) ? value : undefined;
}

function pickNumberArray(input: Record<string, unknown>, ...keys: string[]): number[] | undefined {
  const value = pick(input, ...keys);
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function pickStringArray(input: Record<string, unknown>, ...keys: string[]): string[] | undefined {
  const value = pick(input, ...keys);
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function requireString(input: Record<string, unknown>, field: string, ...aliases: string[]): string {
  const value = pickString(input, field, ...aliases);
  if (!value) throw new Error(`${field} is required`);
  return value;
}

function requireNumber(input: Record<string, unknown>, field: string, ...aliases: string[]): number {
  const value = pickNumber(input, field, ...aliases);
  if (value === undefined) throw new Error(`${field} must be a number`);
  return value;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    out[key] = item;
  }
  return out;
}

function copyAliases(input: Record<string, unknown>, mapping: Array<[string, string[]]>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [wire, aliases] of mapping) {
    const value = pick(input, ...aliases);
    if (value !== undefined) body[wire] = value;
  }
  return compact(body);
}

function interpret(
  result: { status: number; headers: Record<string, string>; body: unknown },
  fallback: string,
  success: (status: number, body: unknown) => Record<string, unknown>,
): ExecResult {
  if (result.status >= 200 && result.status < 300) return { ok: true, value: success(result.status, result.body) };
  const rl = parseBrevoRateLimit(result.status, result.headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: brevoErrorDetail(result.body, fallback) } };
}

function dataOrFlag(status: number, body: unknown, flag: "deleted" | "updated"): Record<string, unknown> {
  if (status === 204) return { [flag]: true };
  return { data: body };
}

function wrap(
  action: string,
  validate: (input: unknown) => Record<string, unknown>,
  exec: (client: BrevoClient, payload: Record<string, unknown>) => Promise<ExecResult>,
) {
  return (input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> => {
    if (isRecord(input) && typeof input.apiKey === "string") {
      const payload = validate(input);
      const client = createBrevoClient({
        apiKey: input.apiKey,
        fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
        operation: action,
      });
      return exec(client, payload).then((result) => {
        if (!result.ok) {
          throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
        }
        return { connector: "brevo", action, source: "connector", ...result.value };
      });
    }
    return { connector: "brevo", action, source: "connector", validated: validate(input) };
  };
}

async function call(
  client: BrevoClient,
  path: string,
  init: BrevoFetchInit,
  fallback: string,
  success: (status: number, body: unknown) => Record<string, unknown> = (status, body) => dataOrFlag(status, body, "updated"),
): Promise<ExecResult> {
  return interpret(await client.fetchJSON(path, init), fallback, success);
}

function expandFilters(filters: unknown): Record<string, unknown> {
  if (filters === undefined) return {};
  if (isRecord(filters)) {
    const query: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filters)) query[`filters[${key}]`] = value;
    return query;
  }
  if (typeof filters !== "string") return {};
  try {
    const parsed = JSON.parse(filters);
    if (isRecord(parsed)) return expandFilters(parsed);
  } catch {
    // Keep the raw string for providers that accept filters as a JSON blob.
  }
  return { filters };
}

function requireTogether(start: string | undefined, end: string | undefined, startName: string, endName: string): void {
  if ((start && !end) || (!start && end)) throw new Error(`${startName} and ${endName} must be provided together`);
}

const TEMPLATE_BODY: Array<[string, string[]]> = [
  ["tag", ["tag"]],
  ["sender", ["sender"]],
  ["htmlUrl", ["htmlUrl", "html_url"]],
  ["replyTo", ["replyTo", "reply_to"]],
  ["subject", ["subject"]],
  ["toField", ["toField", "to_field"]],
  ["isActive", ["isActive", "is_active"]],
  ["htmlContent", ["htmlContent", "html_content"]],
  ["templateName", ["templateName", "template_name"]],
  ["attachmentUrl", ["attachmentUrl", "attachment_url"]],
];

const CAMPAIGN_UPDATE_BODY: Array<[string, string[]]> = [
  ["tag", ["tag"]],
  ["name", ["name"]],
  ["footer", ["footer"]],
  ["header", ["header"]],
  ["params", ["params"]],
  ["sender", ["sender"]],
  ["htmlUrl", ["htmlUrl", "html_url"]],
  ["replyTo", ["replyTo", "reply_to"]],
  ["subject", ["subject"]],
  ["toField", ["toField", "to_field"]],
  ["subjectA", ["subjectA", "subject_a"]],
  ["subjectB", ["subjectB", "subject_b"]],
  ["abTesting", ["abTesting", "ab_testing"]],
  ["recurring", ["recurring"]],
  ["splitRule", ["splitRule", "split_rule"]],
  ["recipients", ["recipients"]],
  ["htmlContent", ["htmlContent", "html_content"]],
  ["previewText", ["previewText", "preview_text"]],
  ["scheduledAt", ["scheduledAt", "scheduled_at"]],
  ["utmCampaign", ["utmCampaign", "utm_campaign"]],
  ["winnerDelay", ["winnerDelay", "winner_delay"]],
  ["increaseRate", ["increaseRate", "increase_rate"]],
  ["initialQuota", ["initialQuota", "initial_quota"]],
  ["mirrorActive", ["mirrorActive", "mirror_active"]],
  ["updateFormId", ["updateFormId", "update_form_id"]],
  ["attachmentUrl", ["attachmentUrl", "attachment_url"]],
  ["ipWarmupEnable", ["ipWarmupEnable", "ip_warmup_enable"]],
  ["sendAtBestTime", ["sendAtBestTime", "send_at_best_time"]],
  ["winnerCriteria", ["winnerCriteria", "winner_criteria"]],
  ["unsubscriptionPageId", ["unsubscriptionPageId", "unsubscription_page_id"]],
  ["inlineImageActivation", ["inlineImageActivation", "inline_image_activation"]],
];

export const getAccountInfo = wrap("account.get", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}, (client) => call(client, "/account", { method: "GET" }, "Brevo rejected the account request.", (_status, body) => ({ data: body })));

export const createCompany = wrap("companies.create", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return compact({
    name: requireString(input, "name"),
    attributes: pickObject(input, "attributes"),
    countryCode: pickNumber(input, "countryCode", "country_code"),
    linkedDealsIds: pickStringArray(input, "linkedDealsIds", "linked_deals_ids"),
    linkedContactsIds: pickNumberArray(input, "linkedContactsIds", "linked_contacts_ids"),
  });
}, (client, payload) => call(client, "/companies", { method: "POST", body: JSON.stringify(payload) }, "Brevo rejected the create company request.", (_status, body) => ({ data: body })));

export const getCompany = wrap("companies.get", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { id: requireString(input, "id") };
}, (client, payload) => call(client, `/companies/${encodeURIComponent(String(payload.id))}`, { method: "GET" }, "Brevo rejected the get company request.", (_status, body) => ({ data: body })));

export const deleteCompany = wrap("companies.delete", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { id: requireString(input, "id") };
}, (client, payload) => call(
  client,
  `/companies/${encodeURIComponent(String(payload.id))}`,
  { method: "DELETE" },
  "Brevo rejected the delete company request.",
  () => ({ deleted: true }),
));

export const listCompanies = wrap("companies.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return compact({
    page: pickNumber(input, "page"),
    sort: pickString(input, "sort"),
    limit: pickNumber(input, "limit"),
    sortBy: pickString(input, "sortBy", "sort_by"),
    filters: pick(input, "filters"),
    linkedDealsIds: pickStringArray(input, "linkedDealsIds", "linked_deals_ids"),
    linkedContactsIds: pickNumberArray(input, "linkedContactsIds", "linked_contacts_ids"),
  });
}, (client, payload) => {
  const query = compact({
    page: payload.page,
    sort: payload.sort,
    limit: payload.limit,
    sortBy: payload.sortBy,
    linkedDealsIds: payload.linkedDealsIds,
    linkedContactsIds: payload.linkedContactsIds,
    ...expandFilters(payload.filters),
  });
  return call(client, "/companies", { method: "GET", query }, "Brevo rejected the list companies request.", (_status, body) => ({ data: body }));
});

export const createOrUpdateEmailTemplate = wrap("smtp.templates.createOrUpdate", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  const templateId = pick(input, "templateId", "template_id");
  const body = copyAliases(input, TEMPLATE_BODY);
  if (templateId !== undefined && templateId !== null && templateId !== "") {
    return { templateId, ...body };
  }
  if (typeof body.templateName !== "string" || !body.templateName) throw new Error("templateName is required");
  if (typeof body.subject !== "string" || !body.subject) throw new Error("subject is required");
  if (!isRecord(body.sender)) throw new Error("sender is required");
  return body;
}, async (client, payload) => {
  const templateId = payload.templateId;
  const body = { ...payload };
  delete body.templateId;
  if (templateId !== undefined) {
    return call(
      client,
      `/smtp/templates/${encodeURIComponent(String(templateId))}`,
      { method: "PUT", body: JSON.stringify(body) },
      "Brevo rejected the update template request.",
      () => ({ updated: true }),
    );
  }
  return call(client, "/smtp/templates", { method: "POST", body: JSON.stringify(body) }, "Brevo rejected the create template request.", (_status, responseBody) => ({ data: responseBody }));
});

export const deleteEmailTemplate = wrap("smtp.templates.delete", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { templateId: requireNumber(input, "template_id", "templateId") };
}, (client, payload) => call(
  client,
  `/smtp/templates/${encodeURIComponent(String(payload.templateId))}`,
  { method: "DELETE" },
  "Brevo rejected the delete template request.",
  () => ({ deleted: true }),
));

export const listEmailTemplates = wrap("smtp.templates.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return compact({
    sort: pickString(input, "sort"),
    limit: pickNumber(input, "limit"),
    offset: pickNumber(input, "offset"),
    templateStatus: pickBoolean(input, "templateStatus", "template_status"),
  });
}, (client, payload) => call(client, "/smtp/templates", { method: "GET", query: payload }, "Brevo rejected the list templates request.", (_status, body) => ({ data: body })));

export const getEmailTemplate = wrap("smtp.templates.get", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  const templateId = pick(input, "template_id", "templateId");
  if (templateId === undefined || templateId === null || templateId === "") throw new Error("template_id is required");
  return { templateId };
}, (client, payload) => call(
  client,
  `/smtp/templates/${encodeURIComponent(String(payload.templateId))}`,
  { method: "GET" },
  "Brevo rejected the get template request.",
  (_status, body) => ({ data: body }),
));

export const createSmsCampaign = wrap("smsCampaigns.create", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return compact({
    name: requireString(input, "name"),
    sender: requireString(input, "sender"),
    content: requireString(input, "content"),
    recipients: pickObject(input, "recipients"),
    scheduledAt: pickString(input, "scheduledAt", "scheduled_at"),
    unicodeEnabled: pickBoolean(input, "unicodeEnabled", "unicode_enabled"),
    organisationPrefix: pickString(input, "organisationPrefix", "organizationPrefix", "organisation_prefix"),
    unsubscribeInstruction: pickString(input, "unsubscribeInstruction", "unsubscribe_instruction"),
  });
}, (client, payload) => call(client, "/smsCampaigns", { method: "POST", body: JSON.stringify(payload) }, "Brevo rejected the create SMS campaign request.", (_status, body) => ({ data: body })));

export const deleteSmsCampaign = wrap("smsCampaigns.delete", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireNumber(input, "campaign_id", "campaignId") };
}, (client, payload) => call(
  client,
  `/smsCampaigns/${encodeURIComponent(String(payload.campaignId))}`,
  { method: "DELETE" },
  "Brevo rejected the delete SMS campaign request.",
  () => ({ deleted: true }),
));

export const getSmsCampaign = wrap("smsCampaigns.get", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { campaignId: requireNumber(input, "campaign_id", "campaignId") };
}, (client, payload) => call(
  client,
  `/smsCampaigns/${encodeURIComponent(String(payload.campaignId))}`,
  { method: "GET" },
  "Brevo rejected the get SMS campaign request.",
  (_status, body) => ({ data: body }),
));

export const listSmsCampaigns = wrap("smsCampaigns.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  const startDate = pickString(input, "startDate", "start_date");
  const endDate = pickString(input, "endDate", "end_date");
  requireTogether(startDate, endDate, "startDate", "endDate");
  return compact({
    sort: pickString(input, "sort"),
    limit: pickNumber(input, "limit"),
    offset: pickNumber(input, "offset"),
    status: pickString(input, "status"),
    startDate,
    endDate,
  });
}, (client, payload) => call(client, "/smsCampaigns", { method: "GET", query: payload }, "Brevo rejected the list SMS campaigns request.", (_status, body) => ({ data: body })));

export const getContactCampaignStats = wrap("contacts.campaignStats.get", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  const startDate = pickString(input, "start_date", "startDate");
  const endDate = pickString(input, "end_date", "endDate");
  requireTogether(startDate, endDate, "start_date", "end_date");
  return compact({
    identifier: requireString(input, "identifier"),
    startDate,
    endDate,
  });
}, (client, payload) => call(
  client,
  `/contacts/${encodeURIComponent(String(payload.identifier))}/campaignStats`,
  { method: "GET", query: compact({ startDate: payload.startDate, endDate: payload.endDate }) },
  "Brevo rejected the contact campaign stats request.",
  (_status, body) => ({ data: body }),
));

export const importContacts = wrap("contacts.import", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  const fileUrl = pickString(input, "file_url", "fileUrl");
  const fileBody = pickString(input, "file_body", "fileBody");
  const jsonBody = pick(input, "json_body", "jsonBody");
  if (!fileUrl && !fileBody && jsonBody === undefined) throw new Error("file_url, file_body, or json_body is required");
  const listIds = pickNumberArray(input, "list_ids", "listIds");
  const newListInput = pickObject(input, "new_list", "newList");
  let newList: Record<string, unknown> | undefined;
  if (newListInput) {
    const listName = pickString(newListInput, "listName", "list_name");
    const folderId = pickNumber(newListInput, "folderId", "folder_id");
    if (!listName || folderId === undefined) throw new Error("new_list.list_name and new_list.folder_id are required");
    newList = { listName, folderId };
  }
  if ((!listIds || listIds.length === 0) && !newList) throw new Error("list_ids or new_list is required");
  return compact({
    fileUrl,
    fileBody,
    jsonBody: Array.isArray(jsonBody) ? jsonBody : undefined,
    listIds,
    newList,
    notifyUrl: pickString(input, "notify_url", "notifyUrl"),
    smsBlacklist: pickBoolean(input, "sms_blacklist", "smsBlacklist"),
    emailBlacklist: pickBoolean(input, "email_blacklist", "emailBlacklist"),
    consentGroupIds: pickNumberArray(input, "consent_group_ids", "consentGroupIds"),
    disableNotification: pickBoolean(input, "disable_notification", "disableNotification"),
    updateExistingContacts: pickBoolean(input, "update_existing_contacts", "updateExistingContacts"),
    emptyContactsAttributes: pickBoolean(input, "empty_contacts_attributes", "emptyContactsAttributes"),
  });
}, (client, payload) => call(client, "/contacts/import", { method: "POST", body: JSON.stringify(payload) }, "Brevo rejected the import contacts request.", (_status, body) => ({ data: body })));

export const listContactAttributes = wrap("contacts.attributes.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}, (client) => call(client, "/contacts/attributes", { method: "GET" }, "Brevo rejected the list contact attributes request.", (_status, body) => ({ data: body })));

export const listCrmNotes = wrap("crm.notes.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return compact({
    sort: pickString(input, "sort"),
    limit: pickNumber(input, "limit"),
    entity: pickString(input, "entity"),
    offset: pickNumber(input, "offset"),
    dateTo: pickNumber(input, "date_to", "dateTo"),
    dateFrom: pickNumber(input, "date_from", "dateFrom"),
    entityIds: pickString(input, "entity_ids", "entityIds"),
  });
}, (client, payload) => call(client, "/crm/notes", { method: "GET", query: payload }, "Brevo rejected the list CRM notes request.", (_status, body) => ({ data: body })));

export const listCustomObjectRecords = wrap("crm.objects.records.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return compact({
    objectType: requireString(input, "object_type", "objectType"),
    sort: pickString(input, "sort"),
    limit: pickNumber(input, "limit"),
    page_num: pickNumber(input, "page_num", "pageNum"),
    association: pickBoolean(input, "association"),
  });
}, (client, payload) => call(
  client,
  `/objects/${encodeURIComponent(String(payload.objectType))}/records`,
  {
    method: "GET",
    query: compact({
      sort: payload.sort,
      limit: payload.limit,
      page_num: payload.page_num,
      association: payload.association,
    }),
  },
  "Brevo rejected the list custom object records request.",
  (_status, body) => ({ data: body }),
));

export const listSenders = wrap("senders.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return compact({
    ip: pickString(input, "ip"),
    domain: pickString(input, "domain"),
  });
}, (client, payload) => call(client, "/senders", { method: "GET", query: payload }, "Brevo rejected the list senders request.", (_status, body) => ({ data: body })));

export const listSenderDomains = wrap("senders.domains.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}, (client) => call(client, "/senders/domains", { method: "GET" }, "Brevo rejected the list sender domains request.", (_status, body) => ({ data: body })));

export const listTransactionalEmailEvents = wrap("smtp.events.list", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  const startDate = pickString(input, "start_date", "startDate");
  const endDate = pickString(input, "end_date", "endDate");
  requireTogether(startDate, endDate, "start_date", "end_date");
  const days = pickNumber(input, "days");
  if (days !== undefined && (startDate || endDate)) throw new Error("days cannot be combined with start_date or end_date");
  return compact({
    days,
    sort: pickString(input, "sort"),
    tags: pickString(input, "tags"),
    email: pickString(input, "email"),
    event: pickString(input, "event"),
    limit: pickNumber(input, "limit"),
    offset: pickNumber(input, "offset"),
    endDate,
    messageId: pickString(input, "message_id", "messageId"),
    startDate,
    templateId: pickNumber(input, "template_id", "templateId"),
  });
}, (client, payload) => call(client, "/smtp/statistics/events", { method: "GET", query: payload }, "Brevo rejected the list transactional email events request.", (_status, body) => ({ data: body })));

export const updateEmailCampaign = wrap("emailCampaigns.update", (input) => {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    campaignId: requireNumber(input, "campaign_id", "campaignId"),
    body: copyAliases(input, CAMPAIGN_UPDATE_BODY),
  };
}, (client, payload) => call(
  client,
  `/emailCampaigns/${encodeURIComponent(String(payload.campaignId))}`,
  { method: "PUT", body: JSON.stringify(payload.body) },
  "Brevo rejected the update email campaign request.",
  () => ({ updated: true }),
));

export const brevoParityActions: Record<string, (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>> = {
  "account.get": getAccountInfo,
  "companies.create": createCompany,
  "companies.get": getCompany,
  "companies.delete": deleteCompany,
  "companies.list": listCompanies,
  "smtp.templates.createOrUpdate": createOrUpdateEmailTemplate,
  "smtp.templates.delete": deleteEmailTemplate,
  "smtp.templates.list": listEmailTemplates,
  "smtp.templates.get": getEmailTemplate,
  "smsCampaigns.create": createSmsCampaign,
  "smsCampaigns.delete": deleteSmsCampaign,
  "smsCampaigns.get": getSmsCampaign,
  "smsCampaigns.list": listSmsCampaigns,
  "contacts.campaignStats.get": getContactCampaignStats,
  "contacts.import": importContacts,
  "contacts.attributes.list": listContactAttributes,
  "crm.notes.list": listCrmNotes,
  "crm.objects.records.list": listCustomObjectRecords,
  "senders.list": listSenders,
  "senders.domains.list": listSenderDomains,
  "smtp.events.list": listTransactionalEmailEvents,
  "emailCampaigns.update": updateEmailCampaign,
};
