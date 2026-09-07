export type NotionPage = {
  object?: string;
  id?: string;
  created_time?: string;
  last_edited_time?: string;
  in_trash?: boolean;
  url?: string;
  public_url?: string | null;
  parent?: {
    type?: string;
    [key: string]: unknown;
  };
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

export type NormalizedDocument = {
  id: string;
  provider: "notion";
  providerDocumentId: string;
  title: string | null;
  url: string | null;
  parentType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  trashed: boolean;
  modelVersion: "2026-05-14";
  raw: NotionPage;
};

export function normalizeDocument(page: NotionPage): NormalizedDocument {
  const providerDocumentId = requireString(page.id, "page.id");

  return {
    id: `notion:${providerDocumentId}`,
    provider: "notion",
    providerDocumentId,
    title: readTitle(page.properties),
    url: typeof page.url === "string" ? page.url : null,
    parentType: isRecord(page.parent) && typeof page.parent.type === "string" ? page.parent.type : null,
    createdAt: typeof page.created_time === "string" ? page.created_time : null,
    updatedAt: typeof page.last_edited_time === "string" ? page.last_edited_time : null,
    trashed: page.in_trash === true,
    modelVersion: "2026-05-14",
    raw: page,
  };
}

export function parseNextCursor(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }
  const cursor = response.next_cursor;
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

function readTitle(properties: unknown): string | null {
  if (!isRecord(properties)) {
    return null;
  }
  for (const value of Object.values(properties)) {
    if (!isRecord(value) || value.type !== "title" || !Array.isArray(value.title)) {
      continue;
    }
    const title = value.title
      .map((part) => isRecord(part) && typeof part.plain_text === "string" ? part.plain_text : "")
      .join("")
      .trim();
    if (title.length > 0) {
      return title;
    }
  }
  return null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
