import { createSaleshandyClient, parseSaleshandyRateLimit, isRecord } from "./http";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function handleError(status: number, headers: Record<string, string>, fallbackMessage: string): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const rl = parseSaleshandyRateLimit(status, headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "SalesHandy rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallbackMessage } };
}

function throwIfError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

// Extracts data from the SalesHandy API envelope:
// Real API: { message: "...", payload: { ... } }
// Falls back gracefully to direct body or legacy { data, meta } shape.
function extractPayload(body: unknown): { data: unknown; meta: unknown } {
  if (!isRecord(body)) return { data: body, meta: {} };
  // Real API envelope: { message, payload }
  if (body.payload !== undefined) return { data: body.payload, meta: {} };
  // Legacy / fallback: { data, meta }
  return { data: body.data ?? body, meta: body.meta ?? {} };
}

// ─── API path constants (verified against https://developer.saleshandy.com/api-reference/) ──
// Base URL: https://open-api.saleshandy.com/v1
// Auth:     x-api-key header
// Envelope: { message: string, payload: { ... } }
const PATHS = {
  SEQUENCES_LIST:                    "/v1/sequences",
  SEQUENCES_GET:                     (id: string) => `/v1/sequences/${id}`,
  SEQUENCES_CREATE:                  "/v1/sequences",
  SEQUENCES_PAUSE:                   (id: string) => `/v1/sequences/${id}/pause`,
  SEQUENCES_RESUME:                  (id: string) => `/v1/sequences/${id}/resume`,
  SEQUENCE_STEPS_LIST:               (id: string) => `/v1/sequences/${id}/steps`,
  // Real API: import prospects to a sequence step via POST /v1/prospects/import
  // The stepId identifies which sequence + step to add prospects to.
  PROSPECTS_IMPORT:                  "/v1/prospects/import",
  // Real API: GET /v1/prospects for listing
  PROSPECTS_LIST:                    "/v1/prospects",
  PROSPECTS_GET:                     (id: string) => `/v1/prospects/${id}`,
  // Real API: POST /v1/prospects/{id}/attribute for updating prospect fields
  PROSPECTS_UPDATE_ATTRIBUTE:        (id: string) => `/v1/prospects/${id}/attribute`,
  // Real API: PATCH /v1/prospects/status for pause/resume/unsubscribe
  PROSPECTS_STATUS:                  "/v1/prospects/status",
  // Real API: POST /v1/email-accounts for fetching (POST with filter body)
  EMAIL_ACCOUNTS_LIST:               "/v1/email-accounts",
} as const;

// ─── sequences.list ──────────────────────────────────────────────────────────

export type SequencesListInput = { page?: number; pageSize?: number };

export function validateSequencesListInput(input: unknown): SequencesListInput {
  if (!isRecord(input)) throw new Error("sequences.list input must be an object");
  const payload: SequencesListInput = {};
  if (typeof input.page === "number") payload.page = input.page;
  // Accept both 'limit' (legacy) and 'pageSize' (real API param)
  if (typeof input.pageSize === "number") payload.pageSize = input.pageSize;
  else if (typeof input.limit === "number") payload.pageSize = input.limit;
  return payload;
}

export function createSequencesClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createSaleshandyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "sequences.list" });
  return {
    async list(input: unknown) {
      const payload = validateSequencesListInput(input);
      const params = new URLSearchParams();
      if (payload.page !== undefined) params.set("page", String(payload.page));
      if (payload.pageSize !== undefined) params.set("pageSize", String(payload.pageSize));
      const query = params.toString();
      const response = await client.fetchJSON(`${PATHS.SEQUENCES_LIST}${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const { data } = extractPayload(response.body);
        // payload: { sequences: [...], total: N }
        const sequences = isRecord(data) && Array.isArray((data as Record<string, unknown>).sequences)
          ? (data as Record<string, unknown>).sequences
          : Array.isArray(data) ? data : [];
        const total = isRecord(data) ? (data as Record<string, unknown>).total : undefined;
        return { ok: true as const, sequences, meta: { total } };
      }
      return handleError(response.status, response.headers, "SalesHandy rejected the sequences.list request.");
    },

    async get(input: unknown) {
      if (!isRecord(input)) throw new Error("sequences.get input must be an object");
      const sequenceId = requireString(input.sequenceId, "sequenceId");
      const response = await client.fetchJSON(PATHS.SEQUENCES_GET(sequenceId));
      if (response.status === 200) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, sequence: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Sequence not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the sequences.get request.");
    },

    async create(input: unknown) {
      if (!isRecord(input)) throw new Error("sequences.create input must be an object");
      const name = requireString(input.name, "name");
      const body: Record<string, unknown> = { name };
      if (typeof input.scheduleId === "number") body.scheduleId = input.scheduleId;
      else if (typeof input.scheduleId === "string") body.scheduleId = input.scheduleId;
      if (typeof input.emailAccountId === "number") body.emailAccountId = input.emailAccountId;
      else if (typeof input.emailAccountId === "string") body.emailAccountId = input.emailAccountId;
      const response = await client.fetchJSON(PATHS.SEQUENCES_CREATE, { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, sequence: data };
      }
      return handleError(response.status, response.headers, "SalesHandy rejected the sequences.create request.");
    },

    async pause(input: unknown) {
      if (!isRecord(input)) throw new Error("sequences.pause input must be an object");
      const sequenceId = requireString(input.sequenceId, "sequenceId");
      const response = await client.fetchJSON(PATHS.SEQUENCES_PAUSE(sequenceId), { method: "POST" });
      if (response.status === 200 || response.status === 201 || response.status === 204) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, result: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Sequence not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the sequences.pause request.");
    },

    async resume(input: unknown) {
      if (!isRecord(input)) throw new Error("sequences.resume input must be an object");
      const sequenceId = requireString(input.sequenceId, "sequenceId");
      const response = await client.fetchJSON(PATHS.SEQUENCES_RESUME(sequenceId), { method: "POST" });
      if (response.status === 200 || response.status === 201 || response.status === 204) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, result: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Sequence not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the sequences.resume request.");
    },

    async steps(input: unknown) {
      if (!isRecord(input)) throw new Error("sequence.steps.list input must be an object");
      const sequenceId = requireString(input.sequenceId, "sequenceId");
      const response = await client.fetchJSON(PATHS.SEQUENCE_STEPS_LIST(sequenceId));
      if (response.status === 200) {
        const { data } = extractPayload(response.body);
        // payload: { steps: [...] }
        const steps = isRecord(data) && Array.isArray((data as Record<string, unknown>).steps)
          ? (data as Record<string, unknown>).steps
          : Array.isArray(data) ? data : [];
        return { ok: true as const, steps };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Sequence not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the sequence.steps.list request.");
    },
  };
}

export function validateSequencesGetInput(input: unknown): { sequenceId: string } {
  if (!isRecord(input)) throw new Error("sequences.get input must be an object");
  return { sequenceId: requireString(input.sequenceId, "sequenceId") };
}

export function validateSequencesCreateInput(input: unknown): { name: string; scheduleId?: string | number; emailAccountId?: string | number } {
  if (!isRecord(input)) throw new Error("sequences.create input must be an object");
  return {
    name: requireString(input.name, "name"),
    scheduleId: typeof input.scheduleId === "string" || typeof input.scheduleId === "number" ? input.scheduleId : undefined,
    emailAccountId: typeof input.emailAccountId === "string" || typeof input.emailAccountId === "number" ? input.emailAccountId : undefined,
  };
}

export function validateSequencesPauseInput(input: unknown): { sequenceId: string } {
  if (!isRecord(input)) throw new Error("sequences.pause input must be an object");
  return { sequenceId: requireString(input.sequenceId, "sequenceId") };
}

export function validateSequencesResumeInput(input: unknown): { sequenceId: string } {
  if (!isRecord(input)) throw new Error("sequences.resume input must be an object");
  return { sequenceId: requireString(input.sequenceId, "sequenceId") };
}

export function validateSequenceStepsListInput(input: unknown): { sequenceId: string } {
  if (!isRecord(input)) throw new Error("sequence.steps.list input must be an object");
  return { sequenceId: requireString(input.sequenceId, "sequenceId") };
}

export function listSequences(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSequencesClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .list(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "sequences.list", source: "connector", sequences: result.sequences, meta: result.meta };
      });
  }
  return { connector: "saleshandy", action: "sequences.list", source: "connector", validated: validateSequencesListInput(input) };
}

export function getSequence(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSequencesClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .get(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "sequences.get", source: "connector", sequence: result.sequence };
      });
  }
  return { connector: "saleshandy", action: "sequences.get", source: "connector", validated: validateSequencesGetInput(input) };
}

export function createSequence(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSequencesClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .create(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "sequences.create", source: "connector", sequence: result.sequence };
      });
  }
  return { connector: "saleshandy", action: "sequences.create", source: "connector", validated: validateSequencesCreateInput(input) };
}

export function pauseSequence(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSequencesClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .pause(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "sequences.pause", source: "connector", result: result.result };
      });
  }
  return { connector: "saleshandy", action: "sequences.pause", source: "connector", validated: validateSequencesPauseInput(input) };
}

export function resumeSequence(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSequencesClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .resume(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "sequences.resume", source: "connector", result: result.result };
      });
  }
  return { connector: "saleshandy", action: "sequences.resume", source: "connector", validated: validateSequencesResumeInput(input) };
}

export function listSequenceSteps(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createSequencesClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .steps(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "sequence.steps.list", source: "connector", steps: result.steps };
      });
  }
  return { connector: "saleshandy", action: "sequence.steps.list", source: "connector", validated: validateSequenceStepsListInput(input) };
}

// ─── prospects ────────────────────────────────────────────────────────────────

// Real API uses POST /v1/prospects/import with prospectList + stepId.
// Each prospect is described as { fields: [{ id, value }] } but we also accept
// a convenience shape { email, firstName, ... } and map the well-known field names.
export type ProspectItem = { email: string; firstName?: string; lastName?: string; company?: string; phone?: string; website?: string; title?: string; customFields?: Record<string, unknown> };

export type ProspectsAddToSequenceInput = { stepId: string; prospects: ProspectItem[]; verifyProspects?: boolean; conflictAction?: string };

export function validateProspectsAddToSequenceInput(input: unknown): ProspectsAddToSequenceInput {
  if (!isRecord(input)) throw new Error("prospects.add_to_sequence input must be an object");
  // Accept stepId directly; also allow sequenceId as a fallback alias (best-effort)
  const stepId = requireString(
    input.stepId !== undefined ? input.stepId : input.sequenceId,
    "stepId"
  );
  if (!Array.isArray(input.prospects) || input.prospects.length === 0) throw new Error("prospects is required and must be a non-empty array");
  const prospects: ProspectItem[] = input.prospects.map((p: unknown, i: number) => {
    if (!isRecord(p)) throw new Error(`prospects[${i}] must be an object`);
    if (typeof p.email !== "string" || p.email.length === 0) throw new Error(`prospects[${i}].email is required`);
    return {
      email: p.email,
      ...(typeof p.firstName === "string" ? { firstName: p.firstName } : {}),
      ...(typeof p.lastName === "string" ? { lastName: p.lastName } : {}),
      ...(typeof p.company === "string" ? { company: p.company } : {}),
      ...(typeof p.phone === "string" ? { phone: p.phone } : {}),
      ...(typeof p.website === "string" ? { website: p.website } : {}),
      ...(typeof p.title === "string" ? { title: p.title } : {}),
      ...(isRecord(p.customFields) ? { customFields: p.customFields as Record<string, unknown> } : {}),
    };
  });
  return {
    stepId,
    prospects,
    verifyProspects: typeof input.verifyProspects === "boolean" ? input.verifyProspects : false,
    conflictAction: typeof input.conflictAction === "string" ? input.conflictAction : "overwrite",
  };
}

export type ProspectsListInput = { page?: number; pageSize?: number; search?: string };

export function validateProspectsListInput(input: unknown): ProspectsListInput {
  if (!isRecord(input)) throw new Error("prospects.list input must be an object");
  const payload: ProspectsListInput = {};
  if (typeof input.page === "number") payload.page = input.page;
  // Accept 'limit' (legacy) as alias for pageSize
  if (typeof input.pageSize === "number") payload.pageSize = input.pageSize;
  else if (typeof input.limit === "number") payload.pageSize = input.limit;
  if (typeof input.search === "string") payload.search = input.search;
  return payload;
}

export function validateProspectsGetInput(input: unknown): { prospectId: string } {
  if (!isRecord(input)) throw new Error("prospects.get input must be an object");
  return { prospectId: requireString(input.prospectId, "prospectId") };
}

export function validateProspectsUpdateInput(input: unknown): { prospectId: string; firstName?: string; lastName?: string; company?: string; phone?: string; website?: string; title?: string; customFields?: Record<string, unknown> } {
  if (!isRecord(input)) throw new Error("prospects.update input must be an object");
  return {
    prospectId: requireString(input.prospectId, "prospectId"),
    ...(typeof input.firstName === "string" ? { firstName: input.firstName } : {}),
    ...(typeof input.lastName === "string" ? { lastName: input.lastName } : {}),
    ...(typeof input.company === "string" ? { company: input.company } : {}),
    ...(typeof input.phone === "string" ? { phone: input.phone } : {}),
    ...(typeof input.website === "string" ? { website: input.website } : {}),
    ...(typeof input.title === "string" ? { title: input.title } : {}),
    ...(isRecord(input.customFields) ? { customFields: input.customFields as Record<string, unknown> } : {}),
  };
}

export function validateProspectsPauseInput(input: unknown): { sequenceId: string; prospectId: string } {
  if (!isRecord(input)) throw new Error("prospects.pause input must be an object");
  return { sequenceId: requireString(input.sequenceId, "sequenceId"), prospectId: requireString(input.prospectId, "prospectId") };
}

export function validateProspectsResumeInput(input: unknown): { sequenceId: string; prospectId: string } {
  if (!isRecord(input)) throw new Error("prospects.resume input must be an object");
  return { sequenceId: requireString(input.sequenceId, "sequenceId"), prospectId: requireString(input.prospectId, "prospectId") };
}

export function validateProspectsUnsubscribeInput(input: unknown): { prospectId: string } {
  if (!isRecord(input)) throw new Error("prospects.unsubscribe input must be an object");
  return { prospectId: requireString(input.prospectId, "prospectId") };
}

export function createProspectsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createSaleshandyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "prospects.list" });
  return {
    // Real API: POST /v1/prospects/import  (adds prospects to a sequence step)
    // Body: { prospectList: [{ fields: [...] }], stepId, verifyProspects, conflictAction }
    // We accept a friendlier input shape and build the prospectList from it.
    async addToSequence(input: unknown) {
      const payload = validateProspectsAddToSequenceInput(input);
      // Build prospectList: map convenience fields to field-name-based import format.
      // The import-with-field-name endpoint accepts named fields directly.
      const prospectList = payload.prospects.map((p) => ({
        email: p.email,
        ...(p.firstName ? { firstName: p.firstName } : {}),
        ...(p.lastName ? { lastName: p.lastName } : {}),
        ...(p.company ? { company: p.company } : {}),
        ...(p.phone ? { phone: p.phone } : {}),
        ...(p.website ? { website: p.website } : {}),
        ...(p.title ? { title: p.title } : {}),
        ...(p.customFields ? { ...p.customFields } : {}),
      }));
      const response = await client.fetchJSON("/v1/prospects/import-with-field-name", {
        method: "POST",
        body: JSON.stringify({
          prospectList,
          stepId: payload.stepId,
          verifyProspects: payload.verifyProspects,
          conflictAction: payload.conflictAction,
        }),
      });
      if (response.status === 200 || response.status === 201) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, result: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Sequence step not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the prospects.add_to_sequence request.");
    },

    async list(input: unknown) {
      const payload = validateProspectsListInput(input);
      const params = new URLSearchParams();
      if (payload.page !== undefined) params.set("page", String(payload.page));
      if (payload.pageSize !== undefined) params.set("pageSize", String(payload.pageSize));
      if (payload.search) params.set("search", payload.search);
      const query = params.toString();
      const response = await client.fetchJSON(`${PATHS.PROSPECTS_LIST}${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const { data } = extractPayload(response.body);
        // payload: { list: [...], total: N }
        const prospects = isRecord(data) && Array.isArray((data as Record<string, unknown>).list)
          ? (data as Record<string, unknown>).list
          : Array.isArray(data) ? data : [];
        const total = isRecord(data) ? (data as Record<string, unknown>).total : undefined;
        return { ok: true as const, prospects, meta: { total } };
      }
      return handleError(response.status, response.headers, "SalesHandy rejected the prospects.list request.");
    },

    async get(input: unknown) {
      if (!isRecord(input)) throw new Error("prospects.get input must be an object");
      const prospectId = requireString(input.prospectId, "prospectId");
      const response = await client.fetchJSON(PATHS.PROSPECTS_GET(prospectId));
      if (response.status === 200) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, prospect: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Prospect not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the prospects.get request.");
    },

    // Real API: POST /v1/prospects/{id}/attribute  (update fields)
    // Body: { attributes: [{ fieldId, attributeValue }] } or individual field update
    // We accept human-readable field names and translate.
    async update(input: unknown) {
      const payload = validateProspectsUpdateInput(input);
      const { prospectId, ...fields } = payload;
      // Map friendly names to attribute update format.
      // SalesHandy uses fieldId references; here we pass them as-is for caller flexibility,
      // but also support the direct named-attribute approach via the attribute endpoint.
      const response = await client.fetchJSON(PATHS.PROSPECTS_UPDATE_ATTRIBUTE(prospectId), {
        method: "POST",
        body: JSON.stringify(fields),
      });
      if (response.status === 200) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, prospect: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Prospect not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the prospects.update request.");
    },

    // Real API: PATCH /v1/prospects/status  with { prospectAndSequenceIds: [{prospectId, sequenceId}], status: "paused" }
    async pause(input: unknown) {
      const payload = validateProspectsPauseInput(input);
      const response = await client.fetchJSON(PATHS.PROSPECTS_STATUS, {
        method: "PATCH",
        body: JSON.stringify({
          prospectAndSequenceIds: [{ prospectId: payload.prospectId, sequenceId: payload.sequenceId }],
          status: "paused",
        }),
      });
      if (response.status === 200 || response.status === 201 || response.status === 204) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, result: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Sequence or prospect not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the prospects.pause request.");
    },

    // Real API: PATCH /v1/prospects/status with { ..., status: "active" }
    async resume(input: unknown) {
      const payload = validateProspectsResumeInput(input);
      const response = await client.fetchJSON(PATHS.PROSPECTS_STATUS, {
        method: "PATCH",
        body: JSON.stringify({
          prospectAndSequenceIds: [{ prospectId: payload.prospectId, sequenceId: payload.sequenceId }],
          status: "active",
        }),
      });
      if (response.status === 200 || response.status === 201 || response.status === 204) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, result: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Sequence or prospect not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the prospects.resume request.");
    },

    // Real API: PATCH /v1/prospects/status with { ..., status: "unsubscribed" }
    async unsubscribe(input: unknown) {
      if (!isRecord(input)) throw new Error("prospects.unsubscribe input must be an object");
      const prospectId = requireString(input.prospectId, "prospectId");
      // sequenceId is optional for unsubscribe (global unsubscribe)
      const body: Record<string, unknown> = { status: "unsubscribed" };
      if (typeof input.sequenceId === "string" && input.sequenceId.length > 0) {
        body.prospectAndSequenceIds = [{ prospectId, sequenceId: input.sequenceId }];
      } else {
        body.prospectAndSequenceIds = [{ prospectId }];
      }
      const response = await client.fetchJSON(PATHS.PROSPECTS_STATUS, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (response.status === 200 || response.status === 201 || response.status === 204) {
        const { data } = extractPayload(response.body);
        return { ok: true as const, result: data };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Prospect not found." } };
      return handleError(response.status, response.headers, "SalesHandy rejected the prospects.unsubscribe request.");
    },
  };
}

export function addProspectsToSequence(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .addToSequence(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "prospects.add_to_sequence", source: "connector", result: result.result };
      });
  }
  return { connector: "saleshandy", action: "prospects.add_to_sequence", source: "connector", validated: validateProspectsAddToSequenceInput(input) };
}

export function listProspects(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .list(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "prospects.list", source: "connector", prospects: result.prospects, meta: result.meta };
      });
  }
  return { connector: "saleshandy", action: "prospects.list", source: "connector", validated: validateProspectsListInput(input) };
}

export function getProspect(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .get(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "prospects.get", source: "connector", prospect: result.prospect };
      });
  }
  return { connector: "saleshandy", action: "prospects.get", source: "connector", validated: validateProspectsGetInput(input) };
}

export function updateProspect(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .update(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "prospects.update", source: "connector", prospect: result.prospect };
      });
  }
  return { connector: "saleshandy", action: "prospects.update", source: "connector", validated: validateProspectsUpdateInput(input) };
}

export function pauseProspect(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .pause(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "prospects.pause", source: "connector", result: result.result };
      });
  }
  return { connector: "saleshandy", action: "prospects.pause", source: "connector", validated: validateProspectsPauseInput(input) };
}

export function resumeProspect(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .resume(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "prospects.resume", source: "connector", result: result.result };
      });
  }
  return { connector: "saleshandy", action: "prospects.resume", source: "connector", validated: validateProspectsResumeInput(input) };
}

export function unsubscribeProspect(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createProspectsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .unsubscribe(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "prospects.unsubscribe", source: "connector", result: result.result };
      });
  }
  return { connector: "saleshandy", action: "prospects.unsubscribe", source: "connector", validated: validateProspectsUnsubscribeInput(input) };
}

// ─── email_accounts.list ──────────────────────────────────────────────────────

// Real API: POST /v1/email-accounts for listing with filter body
export type EmailAccountsListInput = { page?: number; pageSize?: number; search?: string; status?: string };

export function validateEmailAccountsListInput(input: unknown): EmailAccountsListInput {
  if (!isRecord(input)) throw new Error("email_accounts.list input must be an object");
  const payload: EmailAccountsListInput = {};
  if (typeof input.page === "number") payload.page = input.page;
  // Accept 'limit' (legacy) as alias for pageSize
  if (typeof input.pageSize === "number") payload.pageSize = input.pageSize;
  else if (typeof input.limit === "number") payload.pageSize = input.limit;
  if (typeof input.search === "string") payload.search = input.search;
  if (typeof input.status === "string") payload.status = input.status;
  return payload;
}

export function createEmailAccountsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createSaleshandyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "email_accounts.list" });
  return {
    // Real API: POST /v1/email-accounts (POST with filter body, not GET with query params)
    async list(input: unknown) {
      const payload = validateEmailAccountsListInput(input);
      const body: Record<string, unknown> = {};
      if (payload.page !== undefined) body.page = payload.page;
      if (payload.pageSize !== undefined) body.pageSize = payload.pageSize;
      if (payload.search) body.search = payload.search;
      if (payload.status) body.status = payload.status;
      const response = await client.fetchJSON(PATHS.EMAIL_ACCOUNTS_LIST, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 200) {
        const { data } = extractPayload(response.body);
        // payload: { emailAccounts: [...], total: N }
        const emailAccounts = isRecord(data) && Array.isArray((data as Record<string, unknown>).emailAccounts)
          ? (data as Record<string, unknown>).emailAccounts
          : Array.isArray(data) ? data : [];
        const total = isRecord(data) ? (data as Record<string, unknown>).total : undefined;
        return { ok: true as const, emailAccounts, meta: { total } };
      }
      return handleError(response.status, response.headers, "SalesHandy rejected the email_accounts.list request.");
    },
  };
}

export function listEmailAccounts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createEmailAccountsClient({ apiKey: input.apiKey, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined })
      .list(input).then((result) => {
        if (!result.ok) throwIfError(result);
        return { connector: "saleshandy", action: "email_accounts.list", source: "connector", emailAccounts: result.emailAccounts, meta: result.meta };
      });
  }
  return { connector: "saleshandy", action: "email_accounts.list", source: "connector", validated: validateEmailAccountsListInput(input) };
}
