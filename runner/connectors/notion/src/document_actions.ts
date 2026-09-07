import { type ConnectorHttpClient } from "../../../bun/src/http";
import { normalizeDocument, parseNextCursor, type NormalizedDocument, type NotionPage } from "./documents";
import {
  isRecord,
  mapNotionCreatePageError,
  mapNotionPageError,
  mapNotionSearchError,
  mapNotionUpdatePageError,
  notionVersion,
  readJsonObject,
  readPageSize,
  requireArray,
  requireNonEmptyString,
} from "./http";

export type DocumentsSearchInput = {
  query?: string;
  cursor?: string;
  pageSize?: number;
};

export type DocumentsGetInput = {
  pageId: string;
};

export type DocumentsCreateInput = {
  parentPageId: string;
  title: string;
  content?: string;
};

export type DocumentsTrashInput = {
  pageId: string;
};

export type DocumentsSearchResult =
  | { ok: true; items: NormalizedDocument[]; cursor: string | null }
  | { ok: false; error: Record<string, unknown> };

export type DocumentsGetResult =
  | { ok: true; document: NormalizedDocument }
  | { ok: false; error: Record<string, unknown> };

export type DocumentsCreateResult =
  | { ok: true; document: NormalizedDocument }
  | { ok: false; error: Record<string, unknown> };

export type DocumentsTrashResult =
  | { ok: true; document: NormalizedDocument }
  | { ok: false; error: Record<string, unknown> };

export function validateDocumentsSearchInput(input: unknown): DocumentsSearchInput {
  if (!isRecord(input)) {
    throw new Error("documents search input must be an object");
  }
  const query = typeof input.query === "string" && input.query.trim().length > 0 ? input.query.trim() : undefined;
  const cursor = typeof input.cursor === "string" && input.cursor.trim().length > 0 ? input.cursor.trim() : undefined;
  const pageSize = input.pageSize === undefined ? undefined : readPageSize(input.pageSize);
  return { query, cursor, pageSize };
}

export function validateDocumentsGetInput(input: unknown): DocumentsGetInput {
  if (!isRecord(input)) {
    throw new Error("documents get input must be an object");
  }
  const pageId = requireNonEmptyString(input.pageId, "pageId");
  return { pageId };
}

export function validateDocumentsCreateInput(input: unknown): DocumentsCreateInput {
  if (!isRecord(input)) {
    throw new Error("documents create input must be an object");
  }
  const parentPageId = requireNonEmptyString(input.parentPageId, "parentPageId");
  const title = requireNonEmptyString(input.title, "title");
  if (title.length > 2000) {
    throw new Error("title exceeds Notion title limit");
  }
  const content = typeof input.content === "string" && input.content.trim().length > 0 ? input.content.trim() : undefined;
  if (content && content.length > 2000) {
    throw new Error("content exceeds Notion paragraph limit");
  }
  return { parentPageId, title, content };
}

export function validateDocumentsTrashInput(input: unknown): DocumentsTrashInput {
  if (!isRecord(input)) {
    throw new Error("documents trash input must be an object");
  }
  const pageId = requireNonEmptyString(input.pageId, "pageId");
  return { pageId };
}

export async function searchNotionDocuments(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DocumentsSearchInput,
): Promise<DocumentsSearchResult> {
  const response = await httpClient.fetchText("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
    },
    body: JSON.stringify(buildSearchPayload(input)),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionSearchError(response.status, response.headers, body) };
  }
  const pages = requireArray(body.results, "results") as NotionPage[];
  return {
    ok: true,
    items: pages.map((page) => normalizeDocument(page)),
    cursor: parseNextCursor(body),
  };
}

export async function getNotionDocument(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DocumentsGetInput,
): Promise<DocumentsGetResult> {
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
    document: normalizeDocument(body as NotionPage),
  };
}

export async function createNotionDocument(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DocumentsCreateInput,
): Promise<DocumentsCreateResult> {
  const response = await httpClient.fetchText("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
    },
    body: JSON.stringify(buildCreatePagePayload(input)),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionCreatePageError(response.status, response.headers, body) };
  }
  return {
    ok: true,
    document: normalizeDocument(body as NotionPage),
  };
}

export async function updatePageTrashState(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: DocumentsTrashInput,
  inTrash: boolean,
): Promise<DocumentsTrashResult> {
  const response = await httpClient.fetchText(`https://api.notion.com/v1/pages/${encodeURIComponent(input.pageId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
    },
    body: JSON.stringify({ in_trash: inTrash }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionUpdatePageError(response.status, response.headers, body) };
  }
  return {
    ok: true,
    document: normalizeDocument(body as NotionPage),
  };
}

function buildCreatePagePayload(input: DocumentsCreateInput): Record<string, unknown> {
  return {
    parent: {
      page_id: input.parentPageId,
    },
    properties: {
      title: {
        title: [{
          text: {
            content: input.title,
          },
        }],
      },
    },
    children: input.content ? [{
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{
          type: "text",
          text: {
            content: input.content,
          },
        }],
      },
    }] : [],
  };
}

function buildSearchPayload(input: DocumentsSearchInput): Record<string, unknown> {
  return {
    ...(input.query ? { query: input.query } : {}),
    ...(input.cursor ? { start_cursor: input.cursor } : {}),
    ...(typeof input.pageSize === "number" ? { page_size: input.pageSize } : {}),
    filter: {
      property: "object",
      value: "page",
    },
    sort: {
      direction: "descending",
      timestamp: "last_edited_time",
    },
  };
}
