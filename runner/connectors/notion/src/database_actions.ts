import { type ConnectorHttpClient } from "../../../bun/src/http";
import {
  buildDatabaseItemCreatePayload,
  buildDatabaseItemsQueryPayload,
  buildDatabaseItemUpdatePayload,
  normalizeDatabase,
  summarizeDatabase,
  validateDatabaseItemsCreateInput,
  validateDatabaseItemsGetInput,
  validateDatabaseItemsQueryInput,
  validateDatabaseItemsUpdateInput,
  validateDatabasesGetInput,
  type DatabaseItemsCreateInput,
  type DatabaseItemsGetInput,
  type DatabaseItemsQueryInput,
  type DatabaseItemsUpdateInput,
  type DatabaseSummary,
  type DatabasesGetInput,
  type NormalizedDatabase,
} from "./databases";
import { normalizeDocument, parseNextCursor, type NormalizedDocument, type NotionPage } from "./documents";
import {
  mapNotionCreatePageError,
  mapNotionDatabaseError,
  mapNotionPageError,
  mapNotionUpdatePageError,
  notionVersion,
  readJsonObject,
  requireArray,
} from "./http";

export type DatabasesGetResult =
  | { ok: true; database: NormalizedDatabase; summary: DatabaseSummary }
  | { ok: false; error: Record<string, unknown> };

export type DatabaseItemsQueryResult =
  | { ok: true; items: NormalizedDocument[]; cursor: string | null }
  | { ok: false; error: Record<string, unknown> };

export type DatabaseItemsGetResult =
  | { ok: true; item: NormalizedDocument }
  | { ok: false; error: Record<string, unknown> };

export type DatabaseItemsCreateResult =
  | { ok: true; item: NormalizedDocument }
  | { ok: false; error: Record<string, unknown> };

export type DatabaseItemsUpdateResult =
  | { ok: true; item: NormalizedDocument }
  | { ok: false; error: Record<string, unknown> };

export {
  validateDatabaseItemsCreateInput,
  validateDatabaseItemsGetInput,
  validateDatabaseItemsQueryInput,
  validateDatabaseItemsUpdateInput,
  validateDatabasesGetInput,
  type DatabaseItemsCreateInput,
  type DatabaseItemsGetInput,
  type DatabaseItemsQueryInput,
  type DatabaseItemsUpdateInput,
  type DatabasesGetInput,
};

export async function getNotionDatabase(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DatabasesGetInput,
): Promise<DatabasesGetResult> {
  const response = await httpClient.fetchText(`https://api.notion.com/v1/databases/${encodeURIComponent(input.databaseId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": notionVersion,
    },
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionDatabaseError(response.status, response.headers, body) };
  }
  const database = normalizeDatabase(body);
  return {
    ok: true,
    database,
    summary: summarizeDatabase(database),
  };
}

export async function listNotionDatabaseItems(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DatabaseItemsQueryInput,
): Promise<DatabaseItemsQueryResult> {
  const response = await httpClient.fetchText(`https://api.notion.com/v1/databases/${encodeURIComponent(input.databaseId)}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
    },
    body: JSON.stringify(buildDatabaseItemsQueryPayload(input)),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionDatabaseError(response.status, response.headers, body) };
  }
  const pages = requireArray(body.results, "results") as NotionPage[];
  return {
    ok: true,
    items: pages.map((page) => normalizeDocument(page)),
    cursor: parseNextCursor(body),
  };
}

export async function getNotionDatabaseItem(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DatabaseItemsGetInput,
): Promise<DatabaseItemsGetResult> {
  const response = await httpClient.fetchText(`https://api.notion.com/v1/pages/${encodeURIComponent(input.pageId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": notionVersion,
    },
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionPageError(response.status, response.headers, body) };
  }
  return {
    ok: true,
    item: normalizeDocument(body as NotionPage),
  };
}

export async function createNotionDatabaseItem(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DatabaseItemsCreateInput,
): Promise<DatabaseItemsCreateResult> {
  const response = await httpClient.fetchText("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
    },
    body: JSON.stringify(buildDatabaseItemCreatePayload(input)),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionCreatePageError(response.status, response.headers, body) };
  }
  return {
    ok: true,
    item: normalizeDocument(body as NotionPage),
  };
}

export async function updateNotionDatabaseItem(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DatabaseItemsUpdateInput,
): Promise<DatabaseItemsUpdateResult> {
  const response = await httpClient.fetchText(`https://api.notion.com/v1/pages/${encodeURIComponent(input.pageId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
    },
    body: JSON.stringify(buildDatabaseItemUpdatePayload(input)),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionUpdatePageError(response.status, response.headers, body) };
  }
  return {
    ok: true,
    item: normalizeDocument(body as NotionPage),
  };
}
