export type NotionComment = {
  object?: string;
  id?: string;
  parent?: {
    type?: string;
    page_id?: string;
    block_id?: string;
  };
  discussion_id?: string;
  created_time?: string;
  last_edited_time?: string;
  created_by?: {
    id?: string;
  };
  rich_text?: unknown[];
  [key: string]: unknown;
};

export type NormalizedComment = {
  id: string;
  provider: "notion";
  providerCommentId: string;
  parentId: string | null;
  parentType: string | null;
  discussionId: string | null;
  authorId: string | null;
  text: string;
  createdAt: string | null;
  updatedAt: string | null;
  modelVersion: "2026-05-14";
  raw: NotionComment;
};

export function normalizeComment(comment: NotionComment): NormalizedComment {
  const providerCommentId = requireString(comment.id, "comment.id");
  const parentType = isRecord(comment.parent) && typeof comment.parent.type === "string" ? comment.parent.type : null;

  return {
    id: `notion:${providerCommentId}`,
    provider: "notion",
    providerCommentId,
    parentId: readParentId(comment.parent, parentType),
    parentType,
    discussionId: typeof comment.discussion_id === "string" ? comment.discussion_id : null,
    authorId: isRecord(comment.created_by) && typeof comment.created_by.id === "string" ? comment.created_by.id : null,
    text: readRichText(comment.rich_text),
    createdAt: typeof comment.created_time === "string" ? comment.created_time : null,
    updatedAt: typeof comment.last_edited_time === "string" ? comment.last_edited_time : null,
    modelVersion: "2026-05-14",
    raw: comment,
  };
}

export function parseNextCursor(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }
  const cursor = response.next_cursor;
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

function readParentId(parent: unknown, parentType: string | null): string | null {
  if (!isRecord(parent) || !parentType) {
    return null;
  }
  const value = parent[parentType];
  return typeof value === "string" ? value : null;
}

function readRichText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((part) => isRecord(part) && typeof part.plain_text === "string" ? part.plain_text : "")
    .join("")
    .trim();
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
