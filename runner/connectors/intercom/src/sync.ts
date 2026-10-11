/**
 * Intercom list/get/reply/close/assign/tag/search syncs.
 *
 * healthcheck            → GET /me
 * admins.list            → GET /admins
 * contacts.list          → GET /contacts
 * contacts.get           → GET /contacts/{id}
 * companies.list         → POST /companies/list
 * conversations.list     → GET /conversations
 * conversations.get      → GET /conversations/{id}
 * conversations.search   → POST /conversations/search
 * conversations.reply    → POST /conversations/{id}/reply (Idempotent → get)
 * conversations.close    → POST /conversations/{id}/parts (Reconcile → get)
 * conversations.assign   → POST /conversations/{id}/parts (Reconcile → get)
 * conversations.tag      → POST /conversations/{id}/tags (Reconcile → get)
 */

import { createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseAdminsResponse,
  parseContactsResponse,
  parseContactGetResponse,
  parseCompaniesResponse,
  parseConversationsResponse,
  parseConversationGetResponse,
  type NormalizedAdministrator,
  type NormalizedContact,
  type NormalizedCompany,
  type NormalizedConversation,
} from "./objects";

export interface IntercomAuthInput {
  accessToken: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") qs.set(key, value);
  }
  const encoded = qs.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

function compactBody(params: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body[key] = value;
  }
  return body;
}

// ---------------------------------------------------------------------------
// healthcheck — GET /me
// ---------------------------------------------------------------------------

export interface ExecuteHealthcheckSyncInput extends IntercomAuthInput {}

export interface ExecuteHealthcheckSyncOutput {
  ok: true;
  adminId: string | null;
  name: string | null;
}

export async function executeHealthcheckSync(
  input: ExecuteHealthcheckSyncInput,
): Promise<ExecuteHealthcheckSyncOutput> {
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "healthcheck",
  });
  const raw = (await client.getJSON("/me")) as { id?: unknown; name?: unknown };
  return {
    ok: true,
    adminId: typeof raw?.id === "string" || typeof raw?.id === "number" ? String(raw.id) : null,
    name: typeof raw?.name === "string" ? raw.name : null,
  };
}

// ---------------------------------------------------------------------------
// admins.list — GET /admins
// ---------------------------------------------------------------------------

export interface ExecuteAdminsListSyncInput extends IntercomAuthInput {
  displayAvatar?: boolean;
}

export interface ExecuteAdminsListSyncOutput {
  admins: NormalizedAdministrator[];
}

export async function executeAdminsListSync(
  input: ExecuteAdminsListSyncInput,
): Promise<ExecuteAdminsListSyncOutput> {
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "admins.list",
  });
  const path =
    "/admins" +
    buildQuery({
      display_avatar:
        input.displayAvatar === undefined ? undefined : input.displayAvatar ? "true" : "false",
    });
  const raw = await client.getJSON(path);
  return parseAdminsResponse(raw);
}

// ---------------------------------------------------------------------------
// contacts.list — GET /contacts
// ---------------------------------------------------------------------------

export interface ExecuteContactsListSyncInput extends IntercomAuthInput {
  perPage?: number;
  startingAfter?: string;
}

export interface ExecuteContactsListSyncOutput {
  contacts: NormalizedContact[];
  total: number | null;
  nextStartingAfter: string | null;
}

export async function executeContactsListSync(
  input: ExecuteContactsListSyncInput,
): Promise<ExecuteContactsListSyncOutput> {
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "contacts.list",
  });
  const path =
    "/contacts" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      starting_after: input.startingAfter,
    });
  const raw = await client.getJSON(path);
  return parseContactsResponse(raw);
}

// ---------------------------------------------------------------------------
// companies.list — POST /companies/list
// ---------------------------------------------------------------------------

export interface ExecuteCompaniesListSyncInput extends IntercomAuthInput {
  perPage?: number;
  startingAfter?: string;
  page?: number;
  order?: "asc" | "desc";
}

export interface ExecuteCompaniesListSyncOutput {
  companies: NormalizedCompany[];
  total: number | null;
  nextStartingAfter: string | null;
}

export async function executeCompaniesListSync(
  input: ExecuteCompaniesListSyncInput,
): Promise<ExecuteCompaniesListSyncOutput> {
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "companies.list",
  });
  const path =
    "/companies/list" +
    buildQuery({
      page: input.page != null ? String(input.page) : undefined,
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      order: input.order,
      starting_after: input.startingAfter,
    });
  const raw = await client.postJSON(path, {});
  return parseCompaniesResponse(raw);
}

// ---------------------------------------------------------------------------
// conversations.list — GET /conversations
// ---------------------------------------------------------------------------

export interface ExecuteConversationsListSyncInput extends IntercomAuthInput {
  perPage?: number;
  startingAfter?: string;
}

export interface ExecuteConversationsListSyncOutput {
  conversations: NormalizedConversation[];
  total: number | null;
  nextStartingAfter: string | null;
}

export async function executeConversationsListSync(
  input: ExecuteConversationsListSyncInput,
): Promise<ExecuteConversationsListSyncOutput> {
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "conversations.list",
  });
  const path =
    "/conversations" +
    buildQuery({
      per_page: input.perPage != null ? String(input.perPage) : undefined,
      starting_after: input.startingAfter,
    });
  const raw = await client.getJSON(path);
  return parseConversationsResponse(raw);
}

// ---------------------------------------------------------------------------
// conversations.get — GET /conversations/{id}
// ---------------------------------------------------------------------------

export interface ExecuteConversationsGetSyncInput extends IntercomAuthInput {
  /** Intercom conversation id. */
  id: string;
}

export interface ExecuteConversationsGetSyncOutput {
  conversation: NormalizedConversation | null;
}

export async function executeConversationsGetSync(
  input: ExecuteConversationsGetSyncInput,
): Promise<ExecuteConversationsGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "conversations.get",
  });
  const raw = await client.getJSON(`/conversations/${id}`);
  return parseConversationGetResponse(raw);
}

// ---------------------------------------------------------------------------
// conversations.reply — POST /conversations/{id}/reply
// Runtime owns EffectPolicy Idempotent → conversations.get (return raw Conversation with id).
// ---------------------------------------------------------------------------

export interface ExecuteConversationsReplySyncInput extends IntercomAuthInput {
  /** Intercom conversation id (or the literal "last"). */
  id: string;
  /** comment | note (admin replies). */
  messageType: "comment" | "note";
  /** Reply author type — P0 covers admin. */
  type: "admin";
  /** Admin id authoring the reply. */
  adminId: string;
  /** Reply / note body (HTML allowed for notes). */
  body: string;
}

export interface ExecuteConversationsReplySyncOutput {
  /** Upstream Conversation JSON; must include top-level `id` for Idempotent. */
  id?: string | number;
  [key: string]: unknown;
}

export async function executeConversationsReplySync(
  input: ExecuteConversationsReplySyncInput,
): Promise<ExecuteConversationsReplySyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  if (typeof input.body !== "string" || input.body.length === 0) {
    throw new Error("body is required");
  }
  if (typeof input.adminId !== "string" || input.adminId.length === 0) {
    throw new Error("adminId is required");
  }
  if (input.messageType !== "comment" && input.messageType !== "note") {
    throw new Error("messageType must be comment or note");
  }
  if (input.type !== "admin") {
    throw new Error("type must be admin");
  }
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "conversations.reply",
  });
  // POST only — runner EffectPolicy Idempotent observes via conversations.get.
  return (await client.postJSON(
    `/conversations/${id}/reply`,
    compactBody({
      message_type: input.messageType,
      type: input.type,
      admin_id: input.adminId,
      body: input.body,
    }),
  )) as ExecuteConversationsReplySyncOutput;
}

// ---------------------------------------------------------------------------
// conversations.close — POST /conversations/{id}/parts (message_type close)
// Runtime owns EffectPolicy Reconcile → conversations.get.
// ---------------------------------------------------------------------------

export interface ExecuteConversationsCloseSyncInput extends IntercomAuthInput {
  id: string;
  adminId: string;
  body?: string;
}

export interface ExecuteConversationsMutateSyncOutput {
  /** Placeholder; runner Reconcile replaces with conversations.get output. */
  conversation: null;
}

export async function executeConversationsCloseSync(
  input: ExecuteConversationsCloseSyncInput,
): Promise<ExecuteConversationsMutateSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  if (typeof input.adminId !== "string" || input.adminId.length === 0) {
    throw new Error("adminId is required");
  }
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "conversations.close",
  });
  await client.postJSON(
    `/conversations/${id}/parts`,
    compactBody({
      message_type: "close",
      type: "admin",
      admin_id: input.adminId,
      body: input.body,
    }),
  );
  return { conversation: null };
}

// ---------------------------------------------------------------------------
// conversations.assign — POST /conversations/{id}/parts (message_type assignment)
// Runtime owns EffectPolicy Reconcile → conversations.get.
// ---------------------------------------------------------------------------

export interface ExecuteConversationsAssignSyncInput extends IntercomAuthInput {
  id: string;
  adminId: string;
  /** Admin or team id; "0" unassigns. */
  assigneeId: string;
  body?: string;
}

export async function executeConversationsAssignSync(
  input: ExecuteConversationsAssignSyncInput,
): Promise<ExecuteConversationsMutateSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  if (typeof input.adminId !== "string" || input.adminId.length === 0) {
    throw new Error("adminId is required");
  }
  if (typeof input.assigneeId !== "string" || input.assigneeId.length === 0) {
    throw new Error("assigneeId is required");
  }
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "conversations.assign",
  });
  await client.postJSON(
    `/conversations/${id}/parts`,
    compactBody({
      message_type: "assignment",
      type: "admin",
      admin_id: input.adminId,
      assignee_id: input.assigneeId,
      body: input.body,
    }),
  );
  return { conversation: null };
}

// ---------------------------------------------------------------------------
// conversations.tag — POST /conversations/{id}/tags
// Runtime owns EffectPolicy Reconcile → conversations.get (discard Tag).
// ---------------------------------------------------------------------------

export interface ExecuteConversationsTagSyncInput extends IntercomAuthInput {
  id: string;
  tagId: string;
  adminId: string;
}

export async function executeConversationsTagSync(
  input: ExecuteConversationsTagSyncInput,
): Promise<ExecuteConversationsMutateSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  if (typeof input.tagId !== "string" || input.tagId.length === 0) {
    throw new Error("tagId is required");
  }
  if (typeof input.adminId !== "string" || input.adminId.length === 0) {
    throw new Error("adminId is required");
  }
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "conversations.tag",
  });
  await client.postJSON(
    `/conversations/${id}/tags`,
    compactBody({
      id: input.tagId,
      admin_id: input.adminId,
    }),
  );
  return { conversation: null };
}

// ---------------------------------------------------------------------------
// contacts.get — GET /contacts/{id}
// ---------------------------------------------------------------------------

export interface ExecuteContactsGetSyncInput extends IntercomAuthInput {
  id: string;
}

export interface ExecuteContactsGetSyncOutput {
  contact: NormalizedContact | null;
}

export async function executeContactsGetSync(
  input: ExecuteContactsGetSyncInput,
): Promise<ExecuteContactsGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "contacts.get",
  });
  const raw = await client.getJSON(`/contacts/${id}`);
  return parseContactGetResponse(raw);
}

// ---------------------------------------------------------------------------
// conversations.search — POST /conversations/search
// ---------------------------------------------------------------------------

export interface ExecuteConversationsSearchSyncInput extends IntercomAuthInput {
  /** Intercom Search query object (single filter or AND/OR tree). Pass-through. */
  query: Record<string, unknown>;
  perPage?: number;
  startingAfter?: string;
}

export interface ExecuteConversationsSearchSyncOutput {
  conversations: NormalizedConversation[];
  total: number | null;
  nextStartingAfter: string | null;
}

export async function executeConversationsSearchSync(
  input: ExecuteConversationsSearchSyncInput,
): Promise<ExecuteConversationsSearchSyncOutput> {
  if (input.query == null || typeof input.query !== "object" || Array.isArray(input.query)) {
    throw new Error("query is required");
  }
  const client = createAuthClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "conversations.search",
  });
  const body: Record<string, unknown> = { query: input.query };
  if (input.perPage != null || input.startingAfter != null) {
    body.pagination = {
      ...(input.perPage != null ? { per_page: input.perPage } : {}),
      ...(input.startingAfter != null && input.startingAfter !== ""
        ? { starting_after: input.startingAfter }
        : {}),
    };
  }
  const raw = await client.postJSON("/conversations/search", body);
  return parseConversationsResponse(raw);
}
