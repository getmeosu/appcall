import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);
const API = "https://api.clickmeeting.com/v1";

const ALIAS_PAIRS: Array<[string, string]> = [
  ["room_id", "roomId"],
  ["conference_id", "conferenceId"],
  ["session_id", "sessionId"],
  ["file_id", "fileId"],
  ["recording_id", "recordingId"],
  ["poll_id", "pollId"],
  ["survey_id", "surveyId"],
  ["how_many", "howMany"],
  ["country_code", "countryCode"],
  ["skin_id", "skinId"],
  ["access_type", "accessType"],
  ["room_type", "roomType"],
  ["permanent_room", "permanentRoom"],
  ["lobby_enabled", "lobbyEnabled"],
  ["lobby_description", "lobbyDescription"],
  ["custom_room_url_name", "customRoomUrlName"],
  ["starts_at", "startsAt"],
  ["time_zone", "timeZone"],
  ["confirmation_email", "confirmationEmail"],
  ["custom_fields", "customFields"],
  ["meeting_id", "meetingId"],
  ["per_page", "perPage"],
];

const INTEGER_FIELDS = new Set([
  "room_id",
  "roomId",
  "conference_id",
  "conferenceId",
  "session_id",
  "sessionId",
  "file_id",
  "fileId",
  "recording_id",
  "recordingId",
  "poll_id",
  "pollId",
  "how_many",
  "howMany",
  "skin_id",
  "skinId",
  "page",
  "per_page",
  "perPage",
  "meeting_id",
  "meetingId",
]);

const FLAG_FIELDS = new Set(["permanent_room", "permanentRoom", "lobby_enabled", "lobbyEnabled"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function coerceInteger(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return value;
}

export function aliasClickMeetingInput(input: unknown, allowed?: Set<string>): unknown {
  if (!isRecord(input)) return input;
  const out: Record<string, unknown> = { ...input };
  for (const [snake, camel] of ALIAS_PAIRS) {
    if (!present(out[snake]) && present(out[camel])) out[snake] = out[camel];
    if (!present(out[camel]) && present(out[snake])) out[camel] = out[snake];
  }
  const room = out.room_id ?? out.roomId ?? out.conference_id ?? out.conferenceId ?? out.meeting_id ?? out.meetingId;
  if (present(room)) {
    if (!present(out.room_id)) out.room_id = room;
    if (!present(out.roomId)) out.roomId = room;
    if (!present(out.conference_id)) out.conference_id = room;
    if (!present(out.conferenceId)) out.conferenceId = room;
    if (!present(out.meeting_id)) out.meeting_id = room;
  }
  if (!present(out.timezone) && present(out.time_zone)) out.timezone = out.time_zone;
  if (!present(out.time_zone) && present(out.timezone)) out.time_zone = out.timezone;
  if (!present(out.language) && present(out.lang)) out.language = out.lang;
  if (!present(out.lang) && present(out.language)) out.lang = out.language;
  for (const key of INTEGER_FIELDS) {
    if (key in out) out[key] = coerceInteger(out[key]);
  }
  for (const key of FLAG_FIELDS) {
    if (typeof out[key] === "boolean") out[key] = out[key] ? 1 : 0;
  }
  if (!allowed) return out;
  const next: Record<string, unknown> = {};
  const roomKeys = ["room_id", "roomId", "conference_id", "conferenceId", "meeting_id", "meetingId"];
  for (const [key, value] of Object.entries(out)) {
    if (allowed.has(key) || key === "apiKey" || key === "fetch") {
      next[key] = value;
      continue;
    }
    const pair = ALIAS_PAIRS.find(([snake, camel]) => snake === key || camel === key);
    if (pair && (allowed.has(pair[0]) || allowed.has(pair[1]))) continue;
    if (roomKeys.includes(key) && roomKeys.some((alias) => allowed.has(alias))) continue;
    if ((key === "timezone" || key === "time_zone") && (allowed.has("timezone") || allowed.has("time_zone"))) continue;
    if ((key === "language" || key === "lang") && (allowed.has("language") || allowed.has("lang"))) continue;
    next[key] = value;
  }
  return next;
}

function schemaKeys(operationKey: string): Set<string> {
  const operation = (manifest.operations as Record<string, { inputSchema?: { properties?: Record<string, unknown> } }>)[operationKey];
  return new Set(Object.keys(operation?.inputSchema?.properties ?? {}));
}

function applyDefaults(operationKey: string, input: Record<string, unknown>): Record<string, unknown> {
  if (operationKey === "get_registrations" && !present(input.status)) input.status = "all";
  if (operationKey === "generate_session_pdf_report" && !present(input.language)) input.language = "en";
  if (operationKey === "send_invitation" && !present(input.lang)) input.lang = "en";
  return input;
}

function wrap(operationKey: string, handler: (input: unknown) => unknown): (input: unknown) => unknown {
  const allowed = schemaKeys(operationKey);
  return (input: unknown) => {
    const aliased = aliasClickMeetingInput(input, allowed);
    if (isRecord(aliased)) applyDefaults(operationKey, aliased);
    return handler(aliased);
  };
}

function httpClient(input: Record<string, unknown>, timeoutMs: number, maxResponseBytes: number) {
  return createConnectorHttpClient({
    allowedHosts: (manifest.network.allowedHosts as string[]) ?? ["api.clickmeeting.com"],
    maxResponseBytes,
    timeoutMs,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
  });
}

function fail(status: number, body: string, headers: Record<string, string>): never {
  if (status === 429) {
    const retry = Number(headers["retry-after"] ?? "30");
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "ClickMeeting rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retry) ? retry : 30,
    };
  }
  let message = "ClickMeeting request failed.";
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    for (const key of ["error", "message", "error_message", "response", "result"]) {
      if (typeof parsed[key] === "string" && parsed[key]) {
        message = String(parsed[key]);
        break;
      }
    }
  } catch {
    if (body.trim()) message = body.slice(0, 300);
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

async function requestJson(
  input: Record<string, unknown>,
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
  maxResponseBytes = 5242880,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const client = httpClient(input, timeoutMs, maxResponseBytes);
  try {
    return await client.fetchText(url, init);
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
}

function authHeaders(apiKey: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", "X-Api-Key": apiKey };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

function appendForm(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value === "boolean") {
    params.set(key, value ? "1" : "0");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (isRecord(item)) {
        for (const [child, childValue] of Object.entries(item)) {
          appendForm(params, `${key}[${index}][${child}]`, childValue);
        }
      } else {
        appendForm(params, `${key}[${index}]`, item);
      }
    });
    return;
  }
  if (isRecord(value)) {
    for (const [child, childValue] of Object.entries(value)) {
      appendForm(params, `${key}[${child}]`, childValue);
    }
    return;
  }
  params.set(key, String(value));
}

function formFrom(entries: Array<[string, unknown]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) appendForm(params, key, value);
  return params.toString();
}

function requireApiKey(input: unknown): Record<string, unknown> {
  if (!isRecord(input) || typeof input.apiKey !== "string") {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "apiKey is required" };
  }
  return input;
}

function requirePositive(input: Record<string, unknown>, field: string): number {
  const value = coerceInteger(input[field]);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${field} is required` };
  }
  return value;
}

async function sendForm(
  input: Record<string, unknown>,
  method: string,
  url: string,
  body: string,
  timeoutMs = 15000,
): Promise<Record<string, unknown>> {
  const response = await requestJson(input, url, {
    method,
    headers: authHeaders(String(input.apiKey), "application/x-www-form-urlencoded"),
    body,
  }, timeoutMs);
  if (![200, 201, 202, 204].includes(response.status)) fail(response.status, response.body, response.headers);
  if (!response.body.trim()) return { data: null };
  try {
    return { data: JSON.parse(response.body) };
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

const CONFERENCE_FORM_KEYS = [
  "name",
  "room_type",
  "permanent_room",
  "access_type",
  "custom_room_url_name",
  "lobby_description",
  "lobby_enabled",
  "starts_at",
  "duration",
  "timezone",
  "skin_id",
  "password",
  "status",
] as const;

function mapAccessType(value: unknown): unknown {
  if (value === "open" || value === 1 || value === "1") return 1;
  if (value === "password" || value === 2 || value === "2") return 2;
  if (value === "token" || value === 3 || value === "3") return 3;
  return value;
}

function conferenceForm(input: Record<string, unknown>): string {
  const entries: Array<[string, unknown]> = [];
  const copy = { ...input };
  if (present(copy.time_zone) && !present(copy.timezone)) copy.timezone = copy.time_zone;
  if ("access_type" in copy) copy.access_type = mapAccessType(copy.access_type);
  if (typeof copy.permanent_room === "boolean") copy.permanent_room = copy.permanent_room ? 1 : 0;
  if (typeof copy.lobby_enabled === "boolean") copy.lobby_enabled = copy.lobby_enabled ? 1 : 0;
  for (const key of CONFERENCE_FORM_KEYS) {
    if (key in copy) entries.push([key, copy[key]]);
  }
  if (isRecord(copy.registration)) entries.push(["registration", copy.registration]);
  if (isRecord(copy.settings)) entries.push(["settings", copy.settings]);
  return formFrom(entries);
}

async function createConference(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("create_conference"));
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") return compiled.actions.create_conference!(aliased) as Promise<Record<string, unknown>>;
  return sendForm(aliased, "POST", `${API}/conferences`, conferenceForm(aliased));
}

async function updateConference(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("update_conference"));
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") return compiled.actions.update_conference!(aliased) as Promise<Record<string, unknown>>;
  const roomId = requirePositive(aliased, "room_id");
  const body = conferenceForm(aliased);
  if (!body) throw { ok: false, code: "INVALID_ACTION_INPUT", message: "at least one ClickMeeting room field is required for update" };
  return sendForm(aliased, "PUT", `${API}/conferences/${roomId}`, body);
}

async function createContact(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("create_contact"));
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") return compiled.actions.create_contact!(aliased) as Promise<Record<string, unknown>>;
  const entries: Array<[string, unknown]> = [
    ["email", aliased.email],
    ["firstname", aliased.name],
    ["lastname", aliased.surname],
    ["phone", aliased.phone],
    ["company", aliased.company],
    ["country", aliased.country],
  ];
  if (Array.isArray(aliased.custom_fields)) entries.push(["custom_fields", aliased.custom_fields]);
  return sendForm(aliased, "POST", `${API}/contacts`, formFrom(entries));
}

async function registerParticipant(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("register_participant"));
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") return compiled.actions.register_participant!(aliased) as Promise<Record<string, unknown>>;
  const roomId = requirePositive(aliased, "room_id");
  const registration = isRecord(aliased.registration) ? aliased.registration : {};
  const entries: Array<[string, unknown]> = [
    ["registration[1]", registration[1] ?? registration.first_name ?? registration.firstName ?? registration.name],
    ["registration[2]", registration[2] ?? registration.last_name ?? registration.lastName ?? registration.surname],
    ["registration[3]", registration[3] ?? registration.email],
    ["registration[10]", registration[10] ?? registration.company],
  ];
  if (isRecord(aliased.confirmation_email)) {
    entries.push(["confirmation_email[enabled]", aliased.confirmation_email.enabled]);
    entries.push(["confirmation_email[lang]", aliased.confirmation_email.lang]);
  }
  return sendForm(aliased, "POST", `${API}/conferences/${roomId}/registration`, formFrom(entries));
}

async function sendInvitation(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("send_invitation"));
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") return compiled.actions.send_invitation!(aliased) as Promise<Record<string, unknown>>;
  applyDefaults("send_invitation", aliased);
  const conferenceId = requirePositive(aliased, "conference_id");
  const lang = String(aliased.lang || "en");
  const attendees = Array.isArray(aliased.attendees) ? aliased.attendees : [];
  if (attendees.length === 0) throw { ok: false, code: "INVALID_ACTION_INPUT", message: "attendees is required" };
  const entries: Array<[string, unknown]> = [["attendees", attendees], ["template", aliased.template], ["role", aliased.role]];
  return sendForm(aliased, "POST", `${API}/conferences/${conferenceId}/invitation/email/${encodeURIComponent(lang)}`, formFrom(entries));
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function uploadFile(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("upload_file"));
  const record = requireApiKey(aliased);
  const file = isRecord(record.file) ? record.file : null;
  if (!file) throw { ok: false, code: "INVALID_ACTION_INPUT", message: "file is required" };
  const name = String(file.name ?? file.filename ?? file.file_name ?? "upload.bin");
  const raw = String(file.content ?? file.data ?? file.file_content ?? "");
  if (!raw) throw { ok: false, code: "INVALID_ACTION_INPUT", message: "file.content is required" };
  const mime = String(file.mime_type ?? file.content_type ?? file.mimetype ?? "application/octet-stream");
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(raw);
  } catch {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "file.content must be base64" };
  }
  const form = new FormData();
  form.append("uploaded", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  const roomId = present(record.room_id) ? requirePositive(record, "room_id") : null;
  const url = roomId ? `${API}/file-library/conferences/${roomId}` : `${API}/file-library`;
  const response = await requestJson(record, url, {
    method: "POST",
    headers: { Accept: "application/json", "X-Api-Key": String(record.apiKey) },
    body: form,
  }, 30000);
  if (![200, 201, 202].includes(response.status)) fail(response.status, response.body, response.headers);
  try {
    return { data: JSON.parse(response.body) };
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function encodeBase64(body: string): string {
  const bytes = new TextEncoder().encode(body);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function downloadFile(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("download_file"));
  const record = requireApiKey(aliased);
  const fileId = requirePositive(record, "file_id");
  const response = await requestJson(record, `${API}/file-library/${fileId}/download`, {
    method: "GET",
    headers: authHeaders(String(record.apiKey)),
  }, 15000, 10485760);
  if (![200, 201, 202].includes(response.status)) fail(response.status, response.body, response.headers);
  const contentType = response.headers["content-type"] ?? "application/octet-stream";
  if (contentType.includes("json")) {
    try {
      return { data: JSON.parse(response.body) };
    } catch {
      // fall through to base64
    }
  }
  return {
    data: {
      content: encodeBase64(response.body),
      content_type: contentType.split(";")[0] || "application/octet-stream",
      encoding: "base64",
    },
  };
}

async function getMaybeBinary(input: unknown, operationKey: string, path: string): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys(operationKey));
  const record = requireApiKey(aliased);
  const response = await requestJson(record, `${API}${path}`, {
    method: "GET",
    headers: authHeaders(String(record.apiKey)),
  }, 15000, 10485760);
  if (![200, 201, 202].includes(response.status)) fail(response.status, response.body, response.headers);
  const trimmed = response.body.trim();
  if (!trimmed) return { data: null };
  try {
    return { data: JSON.parse(response.body) };
  } catch {
    const contentType = response.headers["content-type"] ?? "application/octet-stream";
    return {
      data: {
        content: encodeBase64(response.body),
        content_type: contentType.split(";")[0] || "application/octet-stream",
        encoding: "base64",
      },
    };
  }
}

function pollsFromAttendees(payload: unknown): Array<Record<string, unknown>> {
  const rows = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.attendees) ? payload.attendees : [];
  const polls: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!isRecord(row) || !Array.isArray(row.polls)) continue;
    for (const poll of row.polls) {
      if (isRecord(poll)) polls.push(poll);
    }
  }
  return polls;
}

function matchPoll(polls: Array<Record<string, unknown>>, id: unknown): Record<string, unknown> | undefined {
  const needle = String(id);
  const byId = polls.find((poll) => String(poll.id ?? poll.poll_id ?? poll.name ?? "") === needle);
  if (byId) return byId;
  const index = Number(id);
  if (Number.isSafeInteger(index) && index >= 1 && index <= polls.length) return polls[index - 1];
  return undefined;
}

async function getAttendeesPayload(input: Record<string, unknown>): Promise<unknown> {
  const conferenceId = requirePositive(input, "conference_id");
  const sessionId = requirePositive(input, "session_id");
  const response = await requestJson(input, `${API}/conferences/${conferenceId}/sessions/${sessionId}/attendees`, {
    method: "GET",
    headers: authHeaders(String(input.apiKey)),
  });
  if (![200, 201, 202].includes(response.status)) fail(response.status, response.body, response.headers);
  try {
    return JSON.parse(response.body);
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

async function getSessionPollDetails(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("get_session_poll_details"));
  const record = requireApiKey(aliased);
  const payload = await getAttendeesPayload(record);
  const polls = pollsFromAttendees(payload);
  return { data: matchPoll(polls, record.poll_id) ?? polls };
}

async function getSessionSurveys(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("get_session_surveys"));
  const record = requireApiKey(aliased);
  const payload = await getAttendeesPayload(record);
  return { data: pollsFromAttendees(payload) };
}

async function getSessionSurveyDetails(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("get_session_survey_details"));
  const record = requireApiKey(aliased);
  const payload = await getAttendeesPayload(record);
  const polls = pollsFromAttendees(payload);
  return { data: matchPoll(polls, record.survey_id) ?? polls };
}

async function getChatDetails(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("get_chat_details"));
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") return compiled.actions.get_chat_details!(aliased) as Promise<Record<string, unknown>>;
  const sessionId = requirePositive(aliased, "session_id");
  return getMaybeBinary(aliased, "get_chat_details", `/chats/${sessionId}`);
}

async function getSessionQaHistory(input: unknown): Promise<Record<string, unknown>> {
  const aliased = aliasClickMeetingInput(input, schemaKeys("get_session_qa_history"));
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") return compiled.actions.get_session_qa_history!(aliased) as Promise<Record<string, unknown>>;
  const sessionId = requirePositive(aliased, "session_id");
  return getMaybeBinary(aliased, "get_session_qa_history", `/chats/${sessionId}`);
}

const HANDWRITTEN: Record<string, (input: unknown) => unknown> = {
  create_conference: createConference,
  update_conference: updateConference,
  create_contact: createContact,
  register_participant: registerParticipant,
  send_invitation: sendInvitation,
  upload_file: uploadFile,
  download_file: downloadFile,
  get_chat_details: getChatDetails,
  get_session_qa_history: getSessionQaHistory,
  get_session_poll_details: getSessionPollDetails,
  get_session_surveys: getSessionSurveys,
  get_session_survey_details: getSessionSurveyDetails,
};

export const actions: Record<string, (input: unknown) => unknown> = {};
for (const [key, handler] of Object.entries(compiled.actions)) {
  const override = HANDWRITTEN[key];
  actions[key] = wrap(key, override ?? handler);
}

export const healthcheck = actions.healthcheck!;
