/**
 * Intercom list/get/reply syncs.
 *
 * healthcheck          → GET /me
 * admins.list          → GET /admins
 * contacts.list        → GET /contacts
 * companies.list       → POST /companies/list
 * conversations.list   → GET /conversations
 * conversations.get    → GET /conversations/{id}
 * conversations.reply  → POST /conversations/{id}/reply
 */

import { createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseAdminsResponse,
  parseContactsResponse,
  parseCompaniesResponse,
  parseConversationsResponse,
  parseConversationGetResponse,
  parseConversationReplyResponse,
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
  conversation: NormalizedConversation | null;
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
  const raw = await client.postJSON(
    `/conversations/${id}/reply`,
    compactBody({
      message_type: input.messageType,
      type: input.type,
      admin_id: input.adminId,
      body: input.body,
    }),
  );
  return parseConversationReplyResponse(raw);
}
