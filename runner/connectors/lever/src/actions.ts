/**
 * Lever Composio-depth actions missing from origin/main (53 ops).
 * Handwritten HTTP via createAuthClient against https://api.lever.{region}/v1.
 * Accepts Composio snake_case and camelCase aliases.
 */
import { createAuthClient, type LeverAuthClient, type LeverHttpMethod } from "./http";
import { assertSafePathSegment, upstreamErrorFor } from "../../_shared/jobboard";

export interface LeverActionInput {
  apiKey: string;
  region: string;
  fetch?: typeof fetch;
  [key: string]: unknown;
}

export type LeverActionSpec = {
  method: LeverHttpMethod;
  path: string;
  required: string[];
  queryKeys: string[];
  bodyKeys: string[];
  repeatQuery: string[];
  emptyOk: boolean;
  multipart: boolean;
  raw: boolean;
  slug: string;
};

export const LEVER_ACTION_SPECS: Record<string, LeverActionSpec> = {
  "opportunities.add_links": {method: "POST", path: "/opportunities/{opportunity}/addLinks", required: ["opportunity", "links"], queryKeys: ["perform_as"], bodyKeys: ["links"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_ADD_OPPORTUNITY_LINKS"},
  "opportunities.add_sources": {method: "POST", path: "/opportunities/{opportunity}/addSources", required: ["opportunity", "sources"], queryKeys: ["perform_as"], bodyKeys: ["sources"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_ADD_OPPORTUNITY_SOURCES"},
  "opportunities.add_tags": {method: "POST", path: "/opportunities/{opportunity}/addTags", required: ["opportunity", "tags"], queryKeys: ["perform_as"], bodyKeys: ["tags"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_ADD_OPPORTUNITY_TAGS"},
  "forms.create": {method: "POST", path: "/opportunities/{opportunity}/forms", required: ["opportunity", "fields", "baseTemplateId"], queryKeys: ["perform_as"], bodyKeys: ["fields", "secret", "baseTemplateId"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_FORM"},
  "form_templates.create": {method: "POST", path: "/form_templates", required: ["text", "fields"], queryKeys: [], bodyKeys: ["text", "group", "fields", "instructions", "secretByDefault"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_FORM_TEMPLATE"},
  "interviews.create": {method: "POST", path: "/opportunities/{opportunity}/interviews", required: ["opportunity", "panel", "date", "duration", "interviewers", "perform_as"], queryKeys: ["perform_as"], bodyKeys: ["date", "note", "panel", "subject", "duration", "location", "interviewers", "feedbackReminder", "feedbackTemplate"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_INTERVIEW"},
  "notes.create": {method: "POST", path: "/opportunities/{opportunity}/notes", required: ["opportunity", "value"], queryKeys: ["perform_as", "note_id"], bodyKeys: ["score", "value", "secret", "createdAt", "notifyFollowers"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_NOTE"},
  "opportunities.create": {method: "POST", path: "/opportunities", required: ["name", "emails"], queryKeys: ["perform_as", "parse", "perform_as_posting_owner"], bodyKeys: ["name", "tags", "links", "owner", "stage", "emails", "origin", "phones", "contact", "sources", "archived", "headline", "location", "postings", "createdAt", "followers"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_OPPORTUNITY"},
  "panels.create": {method: "POST", path: "/opportunities/{opportunity}/panels", required: ["opportunity", "timezone", "interviews", "perform_as"], queryKeys: ["perform_as"], bodyKeys: ["note", "timezone", "interviews", "externalUrl", "applications", "feedbackReminder"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_PANEL"},
  "requisitions.create": {method: "POST", path: "/requisitions", required: ["name", "headcountTotal", "requisitionCode"], queryKeys: [], bodyKeys: ["name", "team", "owner", "status", "backfill", "location", "createdAt", "postingIds", "customFields", "hiringManager", "internalNotes", "headcountTotal", "requisitionCode", "compensationBand", "employmentStatus"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_REQUISITION"},
  "requisition_fields.create": {method: "POST", path: "/requisition_fields", required: ["id", "text", "type"], queryKeys: [], bodyKeys: ["id", "text", "type", "options", "required", "isRequired", "subfields"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_REQUISITION_FIELD"},
  "requisition_fields.create_option": {method: "POST", path: "/requisition_fields/{requisition_field}/options", required: ["requisition_field", "values"], queryKeys: [], bodyKeys: ["values"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_REQUISITION_FIELD_OPTION"},
  "uploads.create": {method: "POST", path: "/uploads", required: [], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: true, raw: false, slug: "LEVER_CREATE_UPLOAD"},
  "users.create": {method: "POST", path: "/users", required: ["name", "email"], queryKeys: [], bodyKeys: ["name", "email", "jobTitle", "managerId", "accessRole", "externalDirectoryId"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_CREATE_USER"},
  "users.deactivate": {method: "POST", path: "/users/{user}/deactivate", required: ["user"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_DEACTIVATE_USER"},
  "form_templates.delete": {method: "DELETE", path: "/form_templates/{form_template}", required: ["form_template"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: true, multipart: false, raw: false, slug: "LEVER_DELETE_FORM_TEMPLATE"},
  "interviews.delete": {method: "DELETE", path: "/opportunities/{opportunity}/interviews/{interview}", required: ["opportunity", "interview", "perform_as"], queryKeys: ["perform_as"], bodyKeys: [], repeatQuery: [], emptyOk: true, multipart: false, raw: false, slug: "LEVER_DELETE_INTERVIEW"},
  "notes.delete": {method: "DELETE", path: "/opportunities/{opportunity}/notes/{note}", required: ["opportunity", "note"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: true, multipart: false, raw: false, slug: "LEVER_DELETE_NOTE"},
  "panels.delete": {method: "DELETE", path: "/opportunities/{opportunity}/panels/{panel}", required: ["opportunity", "panel", "perform_as"], queryKeys: ["perform_as"], bodyKeys: [], repeatQuery: [], emptyOk: true, multipart: false, raw: false, slug: "LEVER_DELETE_PANEL"},
  "requisitions.delete": {method: "DELETE", path: "/requisitions/{requisition}", required: ["requisition"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: true, multipart: false, raw: false, slug: "LEVER_DELETE_REQUISITION"},
  "requisition_fields.delete": {method: "DELETE", path: "/requisition_fields/{requisition_field}", required: ["requisition_field"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: true, multipart: false, raw: false, slug: "LEVER_DELETE_REQUISITION_FIELD"},
  "requisition_fields.delete_option": {method: "DELETE", path: "/requisition_fields/{requisition_field}/options", required: ["requisition_field", "values"], queryKeys: [], bodyKeys: ["values"], repeatQuery: [], emptyOk: true, multipart: false, raw: false, slug: "LEVER_DELETE_REQUISITION_FIELD_OPTION"},
  "files.download": {method: "GET", path: "/opportunities/{opportunity}/files/{file}/download", required: ["opportunity", "file"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: true, slug: "LEVER_DOWNLOAD_FILE"},
  "files.get": {method: "GET", path: "/opportunities/{opportunity}/files/{file}", required: ["opportunity", "file"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_GET_FILE"},
  "forms.get": {method: "GET", path: "/opportunities/{opportunity}/forms/{form}", required: ["opportunity", "form"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_GET_FORM"},
  "form_templates.get": {method: "GET", path: "/form_templates/{form_template}", required: ["form_template"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_GET_FORM_TEMPLATE"},
  "notes.get": {method: "GET", path: "/opportunities/{opportunity}/notes/{note}", required: ["opportunity", "note"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_GET_NOTE"},
  "panels.get": {method: "GET", path: "/opportunities/{opportunity}/panels/{panel}", required: ["opportunity", "panel"], queryKeys: ["expand", "include"], bodyKeys: [], repeatQuery: ["expand", "include"], emptyOk: false, multipart: false, raw: false, slug: "LEVER_GET_PANEL"},
  "requisitions.get": {method: "GET", path: "/requisitions/{requisition}", required: ["requisition"], queryKeys: ["expand", "include"], bodyKeys: [], repeatQuery: ["expand", "include"], emptyOk: false, multipart: false, raw: false, slug: "LEVER_GET_REQUISITION"},
  "requisition_fields.get": {method: "GET", path: "/requisition_fields/{requisition_field}", required: ["requisition_field"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_GET_REQUISITION_FIELD"},
  "stages.get": {method: "GET", path: "/stages/{stage}", required: ["stage"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_GET_STAGE"},
  "files.list": {method: "GET", path: "/opportunities/{opportunity}/files", required: ["opportunity"], queryKeys: ["limit", "offset", "uploaded_at_start", "uploaded_at_end"], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_FILES"},
  "forms.list": {method: "GET", path: "/opportunities/{opportunity}/forms", required: ["opportunity"], queryKeys: ["limit", "offset"], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_FORMS"},
  "form_templates.list": {method: "GET", path: "/form_templates", required: [], queryKeys: ["limit", "offset", "expand", "include"], bodyKeys: [], repeatQuery: ["expand", "include"], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_FORM_TEMPLATES"},
  "panels.list": {method: "GET", path: "/opportunities/{opportunity}/panels", required: ["opportunity"], queryKeys: ["limit", "offset", "expand", "include"], bodyKeys: [], repeatQuery: ["expand", "include"], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_PANELS"},
  "referrals.list": {method: "GET", path: "/opportunities/{opportunity}/referrals", required: ["opportunity"], queryKeys: ["limit", "offset", "expand"], bodyKeys: [], repeatQuery: ["expand"], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_REFERRALS"},
  "requisition_fields.list": {method: "GET", path: "/requisition_fields", required: [], queryKeys: ["type", "limit", "offset", "isRequired"], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_REQUISITION_FIELDS"},
  "resumes.list": {method: "GET", path: "/opportunities/{opportunity}/resumes", required: ["opportunity"], queryKeys: ["limit", "offset", "uploaded_at_start", "uploaded_at_end"], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_RESUMES"},
  "sources.list": {method: "GET", path: "/sources", required: [], queryKeys: ["limit", "offset"], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_SOURCES"},
  "tags.list": {method: "GET", path: "/tags", required: [], queryKeys: ["limit", "offset"], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_LIST_TAGS"},
  "users.reactivate": {method: "POST", path: "/users/{user}/reactivate", required: ["user"], queryKeys: [], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_REACTIVATE_USER"},
  "opportunities.remove_links": {method: "POST", path: "/opportunities/{opportunity}/removeLinks", required: ["opportunity"], queryKeys: ["perform_as"], bodyKeys: ["links"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_REMOVE_CONTACT_LINKS_BY_OPPORTUNITY"},
  "opportunities.remove_sources": {method: "POST", path: "/opportunities/{opportunity}/removeSources", required: ["opportunity", "sources"], queryKeys: ["perform_as"], bodyKeys: ["sources"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_REMOVE_OPPORTUNITY_SOURCES"},
  "opportunities.remove_tags": {method: "POST", path: "/opportunities/{opportunity}/removeTags", required: ["opportunity", "tags"], queryKeys: ["perform_as"], bodyKeys: ["tags"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_REMOVE_OPPORTUNITY_TAGS"},
  "form_templates.update": {method: "PUT", path: "/form_templates/{form_template}", required: ["form_template"], queryKeys: [], bodyKeys: ["text", "group", "fields", "instructions", "secretByDefault"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_UPDATE_FORM_TEMPLATE"},
  "interviews.update": {method: "PUT", path: "/opportunities/{opportunity}/interviews/{interview}", required: ["opportunity", "interview", "panel", "date", "duration", "interviewers", "perform_as"], queryKeys: ["perform_as"], bodyKeys: ["date", "note", "panel", "subject", "duration", "location", "interviewers", "feedbackReminder", "feedbackTemplate"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_UPDATE_INTERVIEW"},
  "notes.update": {method: "PUT", path: "/opportunities/{opportunity}/notes/{note}", required: ["opportunity", "note"], queryKeys: [], bodyKeys: ["user", "score", "secret", "values", "createdAt", "completedAt"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_UPDATE_NOTE"},
  "panels.update": {method: "PUT", path: "/opportunities/{opportunity}/panels/{panel}", required: ["opportunity", "panel", "timezone", "interviews", "perform_as"], queryKeys: ["perform_as"], bodyKeys: ["note", "timezone", "interviews", "externalUrl", "applications", "feedbackReminder"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_UPDATE_PANEL"},
  "requisitions.update": {method: "PUT", path: "/requisitions/{requisition}", required: ["requisition", "name", "headcountTotal", "requisitionCode"], queryKeys: [], bodyKeys: ["name", "team", "owner", "status", "backfill", "location", "department", "postingIds", "customFields", "hiringManager", "internalNotes", "headcountTotal", "confidentiality", "requisitionCode", "timeToFillEndAt", "compensationBand", "employmentStatus", "timeToFillStartAt"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_UPDATE_REQUISITION"},
  "requisition_fields.update": {method: "PUT", path: "/requisition_fields/{requisition_field}", required: ["requisition_field", "id", "text", "type", "isRequired"], queryKeys: [], bodyKeys: ["id", "text", "type", "options", "subfields", "isRequired"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_UPDATE_REQUISITION_FIELD"},
  "requisition_fields.update_option": {method: "PUT", path: "/requisition_fields/{requisition_field}/options", required: ["requisition_field", "values"], queryKeys: [], bodyKeys: ["values"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_UPDATE_REQUISITION_FIELD_OPTION"},
  "users.update": {method: "PUT", path: "/users/{user}", required: ["user", "name", "email", "accessRole"], queryKeys: [], bodyKeys: ["name", "email", "jobTitle", "managerId", "accessRole", "externalDirectoryId"], repeatQuery: [], emptyOk: false, multipart: false, raw: false, slug: "LEVER_UPDATE_USER"},
  "files.upload": {method: "POST", path: "/opportunities/{opportunity}/files", required: ["opportunity", "perform_as"], queryKeys: ["perform_as"], bodyKeys: [], repeatQuery: [], emptyOk: false, multipart: true, raw: false, slug: "LEVER_UPLOAD_FILE"},
};

export const LEVER_ACTION_KEYS = Object.keys(LEVER_ACTION_SPECS);

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`).replace(/^_/, "");
}

function variants(name: string): string[] {
  const camel = toCamel(name);
  const snake = toSnake(name);
  const extra: string[] = [];
  if (name === "opportunity") extra.push("opportunityId", "opportunity_id");
  if (name === "user") extra.push("userId", "user_id");
  if (name === "interview") extra.push("interviewId", "interview_id");
  if (name === "note") extra.push("noteId");
  if (name === "panel") extra.push("panelId", "panel_id");
  if (name === "form") extra.push("formId", "form_id");
  if (name === "file") extra.push("fileId", "file_id");
  if (name === "stage") extra.push("stageId", "stage_id");
  if (name === "requisition") extra.push("requisitionId", "requisition_id");
  if (name === "form_template") extra.push("formTemplate", "formTemplateId");
  if (name === "requisition_field") extra.push("requisitionField");
  if (name === "perform_as") extra.push("performAs");
  if (name === "isRequired") extra.push("required");
  if (name === "note_id") extra.push("noteId");
  return [...new Set([name, camel, snake, ...extra])];
}

function pick(input: Record<string, unknown>, name: string): unknown {
  for (const key of variants(name)) {
    if (input[key] !== undefined) return input[key];
  }
  return undefined;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function asPathId(value: unknown, field: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return assertSafePathSegment(String(Math.trunc(value)), field);
  }
  if (typeof value === "string" && value.length > 0) {
    return assertSafePathSegment(value, field);
  }
  throw new Error(`${field} is required`);
}

function interpolatePath(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{([a-z0-9_]+)\}/g, (_, name: string) => asPathId(pick(input, name), name));
}

function requireFields(input: Record<string, unknown>, names: string[]): void {
  for (const name of names) {
    if (!present(pick(input, name))) throw new Error(`${toCamel(name)} is required`);
  }
}

function formatScalar(value: unknown): string | undefined {
  if (!present(value) && value !== false && value !== 0) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function appendQuery(qs: URLSearchParams, key: string, value: unknown, repeat: boolean): void {
  if (repeat && Array.isArray(value)) {
    for (const item of value) {
      const text = formatScalar(item);
      if (text !== undefined) qs.append(key, text);
    }
    return;
  }
  if (repeat && typeof value === "string" && value.includes(",") === false) {
    const text = formatScalar(value);
    if (text !== undefined) qs.append(key, text);
    return;
  }
  const text = formatScalar(value);
  if (text !== undefined) qs.set(key, text);
}

function buildQuery(input: Record<string, unknown>, spec: LeverActionSpec): string {
  const qs = new URLSearchParams();
  const repeat = new Set(spec.repeatQuery);
  for (const key of spec.queryKeys) {
    const wire = key === "isRequired" ? "isRequired" : key;
    let value = pick(input, key);
    if (key === "isRequired" && value === undefined) value = pick(input, "required");
    appendQuery(qs, wire, value, repeat.has(key));
  }
  const encoded = qs.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

const BODY_WIRE: Record<string, string> = {
  required: "isRequired",
};

function buildBody(input: Record<string, unknown>, spec: LeverActionSpec): Record<string, unknown> | undefined {
  if (spec.bodyKeys.length === 0) return undefined;
  const pathKeys = new Set(Array.from(spec.path.matchAll(/\{([a-z0-9_]+)\}/g), (m) => m[1]));
  const body: Record<string, unknown> = {};
  for (const key of spec.bodyKeys) {
    if (pathKeys.has(key)) continue;
    const value = pick(input, key);
    if (!present(value) && value !== false && value !== 0) continue;
    const wire = BODY_WIRE[key] ?? key;
    body[wire] = value;
  }
  // Prefer Lever isRequired when both required and isRequired are present.
  if (body.required !== undefined && body.isRequired === undefined) {
    body.isRequired = body.required;
    delete body.required;
  } else if (body.required !== undefined && body.isRequired !== undefined) {
    delete body.required;
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

function decodeBase64(value: string): Uint8Array {
  const buf = Buffer.from(value, "base64");
  if (buf.length === 0 && value.length > 0) throw new Error("file_content must be base64");
  return new Uint8Array(buf);
}

function filePart(input: Record<string, unknown>): { blob: Blob; filename: string } {
  const named = pick(input, "file_name");
  const content = pick(input, "file_content");
  const mime = pick(input, "file_mimetype");
  const filename =
    typeof named === "string" && named.length > 0
      ? named
      : "upload.bin";
  const type = typeof mime === "string" && mime.length > 0 ? mime : "application/octet-stream";
  if (typeof content === "string" && content.length > 0) {
    const bytes = decodeBase64(content);
    return { blob: new Blob([bytes], { type }), filename };
  }
  const file = pick(input, "file");
  if (file instanceof Blob) {
    return { blob: file, filename };
  }
  if (file && typeof file === "object" && !Array.isArray(file)) {
    const rec = file as Record<string, unknown>;
    const nestedName = rec.name ?? rec.filename ?? rec.file_name;
    const nestedContent = rec.content ?? rec.file_content ?? rec.data;
    const nestedMime = rec.mimetype ?? rec.mimeType ?? rec.file_mimetype ?? rec.type;
    const nestedFilename = typeof nestedName === "string" && nestedName.length > 0 ? nestedName : filename;
    const nestedType = typeof nestedMime === "string" && nestedMime.length > 0 ? nestedMime : type;
    if (typeof nestedContent === "string" && nestedContent.length > 0) {
      return { blob: new Blob([decodeBase64(nestedContent)], { type: nestedType }), filename: nestedFilename };
    }
  }
  throw new Error("file or file_content is required");
}

async function executeMultipart(
  client: LeverAuthClient,
  spec: LeverActionSpec,
  path: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const form = new FormData();
  const part = filePart(input);
  form.append("file", part.blob, part.filename);
  const response = await client.requestRaw(spec.method, path, { body: form });
  if (response.status < 200 || response.status >= 300) {
    throw upstreamErrorFor("Lever", response.status, response.headers, response.body);
  }
  if (response.status === 204 || response.body.length === 0) return { ok: true as const };
  try {
    return JSON.parse(response.body);
  } catch {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Lever returned a non-JSON body.",
    };
  }
}

async function executeDownload(client: LeverAuthClient, path: string): Promise<unknown> {
  const response = await client.requestRaw("GET", path);
  if (response.status < 200 || response.status >= 300) {
    throw upstreamErrorFor("Lever", response.status, response.headers, response.body);
  }
  return {
    contentType: response.headers["content-type"] ?? "application/octet-stream",
    body: response.body,
  };
}

export async function executeLeverAction(operation: string, input: LeverActionInput): Promise<unknown> {
  const spec = LEVER_ACTION_SPECS[operation];
  if (!spec) throw new Error(`Unknown lever action: ${operation}`);
  requireFields(input, spec.required);
  const path = interpolatePath(spec.path, input) + buildQuery(input, spec);
  const client = createAuthClient({
    apiKey: input.apiKey,
    region: input.region,
    fetch: input.fetch,
    operation,
  });
  if (spec.multipart) return executeMultipart(client, spec, path, input);
  if (spec.raw) return executeDownload(client, path);

  const body = spec.method === "GET" ? undefined : buildBody(input, spec);
  const raw = await client.requestJSON(spec.method, path, body);
  if (raw === undefined) return { ok: true as const };
  return raw;
}

export function createLeverActionHandlers(): Record<string, (input: LeverActionInput) => Promise<unknown>> {
  const handlers: Record<string, (input: LeverActionInput) => Promise<unknown>> = {};
  for (const key of LEVER_ACTION_KEYS) {
    handlers[key] = (input) => executeLeverAction(key, input);
  }
  return handlers;
}
