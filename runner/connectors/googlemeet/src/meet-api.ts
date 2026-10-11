import { createMeetApiClient, extractFetch, googleErrorDetail, isRecord, parseGoogleRateLimit } from "./http";

type Handler = (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>;

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function spaceName(raw: string): string {
  const id = raw.replace(/^spaces\//, "");
  if (!id || id.includes("/")) throw new Error("space name is invalid");
  return `spaces/${id}`;
}

function conferenceRecordName(raw: string): string {
  const id = raw.replace(/^conferenceRecords\//, "");
  if (!id || id.includes("/")) throw new Error("conference record name is invalid");
  return `conferenceRecords/${id}`;
}

function parentName(raw: string): string {
  return raw.startsWith("conferenceRecords/") ? raw.replace(/\/+$/, "") : conferenceRecordName(raw);
}

function encodeResource(name: string): string {
  return name.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function pageQuery(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const pageSize = input.page_size ?? input.pageSize;
  const pageToken = input.page_token ?? input.pageToken;
  if (typeof pageSize === "number" && Number.isFinite(pageSize) && pageSize > 0) {
    params.set("pageSize", String(Math.floor(pageSize)));
  }
  if (typeof pageToken === "string" && pageToken.length > 0) params.set("pageToken", pageToken);
  if (typeof input.filter === "string" && input.filter.length > 0) params.set("filter", input.filter);
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

function fail(status: number, headers: Record<string, string>, body: unknown, fallback: string): never {
  const limited = parseGoogleRateLimit(status, headers);
  if (limited.limited) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Google Meet rate limit exceeded.", retryAfterSeconds: limited.retryAfterSeconds };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: googleErrorDetail(body, fallback) };
}

function asRecord(input: unknown, action: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return input;
}

async function call(
  action: string,
  input: Record<string, unknown>,
  path: string,
  init: RequestInit,
  validated: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (typeof input.accessToken !== "string") {
    return { connector: "googlemeet", action, source: "connector", validated };
  }
  const client = createMeetApiClient({
    accessToken: input.accessToken,
    fetch: extractFetch(input),
    operation: action,
  });
  const res = await client.fetchJSON(path, init);
  if (res.status >= 200 && res.status < 300) {
    return { connector: "googlemeet", action, source: "provider", data: res.body };
  }
  fail(res.status, res.headers, res.body, `Google Meet could not complete ${action}.`);
}

function jsonInit(method: string, body: Record<string, unknown> | undefined): RequestInit {
  if (body === undefined) return { method };
  return { method, body: JSON.stringify(body) };
}

export function createSpace(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "spaces.create");
  const body: Record<string, unknown> = {};
  if (record.config !== undefined) {
    if (!isRecord(record.config)) throw new Error("config must be an object");
    body.config = record.config;
  }
  return call("spaces.create", record, "/spaces", jsonInit("POST", body), { config: body.config });
}

export function endActiveConference(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "spaces.end-active-conference");
  const name = spaceName(requireString(record.space_name, "space_name"));
  return call(
    "spaces.end-active-conference",
    record,
    `/${encodeResource(name)}:endActiveConference`,
    { method: "POST" },
    { space_name: name },
  );
}

export function getSpace(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "spaces.get");
  const name = spaceName(requireString(record.space_name, "space_name"));
  return call("spaces.get", record, `/${encodeResource(name)}`, { method: "GET" }, { space_name: name });
}

export function updateSpace(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "spaces.update");
  const name = spaceName(requireString(record.name, "name"));
  const body: Record<string, unknown> = {};
  if (record.config !== undefined) {
    if (!isRecord(record.config)) throw new Error("config must be an object");
    body.config = record.config;
  }
  const mask = typeof record.updateMask === "string" && record.updateMask.length > 0
    ? `?updateMask=${encodeURIComponent(record.updateMask)}`
    : "";
  return call("spaces.update", record, `/${encodeResource(name)}${mask}`, jsonInit("PATCH", body), {
    name,
    config: body.config,
    updateMask: typeof record.updateMask === "string" ? record.updateMask : undefined,
  });
}

export function getConferenceRecord(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "conference-records.get");
  const name = conferenceRecordName(requireString(record.name, "name"));
  return call("conference-records.get", record, `/${encodeResource(name)}`, { method: "GET" }, { name });
}

export function listConferenceRecords(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "conference-records.list");
  return call(
    "conference-records.list",
    record,
    `/conferenceRecords${pageQuery(record)}`,
    { method: "GET" },
    {},
  );
}

export function listParticipants(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "participants.list");
  const parent = parentName(requireString(record.parent, "parent"));
  return call(
    "participants.list",
    record,
    `/${encodeResource(parent)}/participants${pageQuery(record)}`,
    { method: "GET" },
    { parent },
  );
}

export function getParticipantSession(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "participant-sessions.get");
  const name = requireString(record.name, "name");
  if (!name.startsWith("conferenceRecords/") || !name.includes("/participantSessions/")) {
    throw new Error("name must be a participant session resource");
  }
  return call("participant-sessions.get", record, `/${encodeResource(name)}`, { method: "GET" }, { name });
}

export function listParticipantSessions(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "participant-sessions.list");
  const conference = conferenceRecordName(requireString(record.conference_record_id, "conference_record_id"));
  const participantId = requireString(record.participant_id, "participant_id");
  const parent = `${conference}/participants/${participantId}`;
  return call(
    "participant-sessions.list",
    record,
    `/${encodeResource(parent)}/participantSessions${pageQuery(record)}`,
    { method: "GET" },
    { conference_record_id: conference, participant_id: participantId },
  );
}

export function listRecordings(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "recordings.list");
  const parent = parentName(requireString(record.parent, "parent"));
  return call(
    "recordings.list",
    record,
    `/${encodeResource(parent)}/recordings${pageQuery(record)}`,
    { method: "GET" },
    { parent },
  );
}

export function listRecordingsByConference(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "recordings.by-conference");
  const name = conferenceRecordName(requireString(record.conference_record_id, "conference_record_id"));
  return call(
    "recordings.by-conference",
    record,
    `/${encodeResource(name)}/recordings`,
    { method: "GET" },
    { conference_record_id: name },
  );
}

export function getTranscript(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "transcripts.get");
  const name = requireString(record.name, "name");
  if (!name.startsWith("conferenceRecords/") || !name.includes("/transcripts/")) {
    throw new Error("name must be a transcript resource");
  }
  return call("transcripts.get", record, `/${encodeResource(name)}`, { method: "GET" }, { name });
}

export function listTranscriptsByConference(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "transcripts.by-conference");
  const name = conferenceRecordName(requireString(record.conference_record_id, "conference_record_id"));
  return call(
    "transcripts.by-conference",
    record,
    `/${encodeResource(name)}/transcripts${pageQuery(record)}`,
    { method: "GET" },
    { conference_record_id: name },
  );
}

export function getTranscriptEntry(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "transcript-entries.get");
  const name = requireString(record.name, "name");
  if (!name.includes("/transcripts/") || !name.includes("/entries/")) {
    throw new Error("name must be a transcript entry resource");
  }
  return call("transcript-entries.get", record, `/${encodeResource(name)}`, { method: "GET" }, { name });
}

export function listTranscriptEntries(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input, "transcript-entries.list");
  const conference = conferenceRecordName(requireString(record.conference_record_id, "conference_record_id"));
  const transcriptId = requireString(record.transcript_id, "transcript_id");
  const parent = `${conference}/transcripts/${transcriptId}`;
  return call(
    "transcript-entries.list",
    record,
    `/${encodeResource(parent)}/entries${pageQuery(record)}`,
    { method: "GET" },
    { conference_record_id: conference, transcript_id: transcriptId },
  );
}

export const meetHandlers: Record<string, Handler> = {
  "spaces.create": createSpace,
  "spaces.get": getSpace,
  "spaces.update": updateSpace,
  "spaces.end-active-conference": endActiveConference,
  "conference-records.get": getConferenceRecord,
  "conference-records.list": listConferenceRecords,
  "participants.list": listParticipants,
  "participant-sessions.get": getParticipantSession,
  "participant-sessions.list": listParticipantSessions,
  "recordings.list": listRecordings,
  "recordings.by-conference": listRecordingsByConference,
  "transcripts.get": getTranscript,
  "transcripts.by-conference": listTranscriptsByConference,
  "transcript-entries.get": getTranscriptEntry,
  "transcript-entries.list": listTranscriptEntries,
};
