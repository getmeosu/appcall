import { type ConnectorHttpClient } from "../../../bun/src/http";
import { normalizeComment, parseNextCursor as parseCommentsNextCursor, type NormalizedComment, type NotionComment } from "./comments";
import {
  isRecord,
  mapNotionCommentsCreateError,
  mapNotionCommentsError,
  notionVersion,
  readJsonObject,
  readPageSize,
  requireArray,
  requireNonEmptyString,
} from "./http";

export type CommentsListInput = {
  blockId: string;
  cursor?: string;
  pageSize?: number;
};

export type CommentsCreateInput = {
  pageId: string;
  text: string;
};

export type CommentsListResult =
  | { ok: true; comments: NormalizedComment[]; cursor: string | null }
  | { ok: false; error: Record<string, unknown> };

export type CommentsCreateResult =
  | { ok: true; commentId: string; comment: NormalizedComment | null; limited: boolean }
  | { ok: false; error: Record<string, unknown> };

export function validateCommentsListInput(input: unknown): CommentsListInput {
  if (!isRecord(input)) {
    throw new Error("comments list input must be an object");
  }
  const blockId = requireNonEmptyString(input.blockId, "blockId");
  const cursor = typeof input.cursor === "string" && input.cursor.trim().length > 0 ? input.cursor.trim() : undefined;
  const pageSize = input.pageSize === undefined ? undefined : readPageSize(input.pageSize);
  return { blockId, cursor, pageSize };
}

export function validateCommentsCreateInput(input: unknown): CommentsCreateInput {
  if (!isRecord(input)) {
    throw new Error("comments create input must be an object");
  }
  const pageId = requireNonEmptyString(input.pageId, "pageId");
  const text = requireNonEmptyString(input.text, "text");
  if (text.length > 2000) {
    throw new Error("text exceeds Notion comment limit");
  }
  return { pageId, text };
}

export async function listNotionComments(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: CommentsListInput,
): Promise<CommentsListResult> {
  const response = await httpClient.fetchText(buildCommentsURL(input), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": notionVersion,
    },
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionCommentsError(response.status, response.headers, body) };
  }
  const comments = requireArray(body.results, "results") as NotionComment[];
  return {
    ok: true,
    comments: comments.map((comment) => normalizeComment(comment)),
    cursor: parseCommentsNextCursor(body),
  };
}

export async function createNotionComment(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: CommentsCreateInput,
): Promise<CommentsCreateResult> {
  const response = await httpClient.fetchText("https://api.notion.com/v1/comments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
    },
    body: JSON.stringify(buildCreateCommentPayload(input)),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionCommentsCreateError(response.status, response.headers, body) };
  }
  const commentId = requireNonEmptyString(body.id, "comment.id");
  if (Object.keys(body).length <= 2) {
    return {
      ok: true,
      commentId,
      comment: null,
      limited: true,
    };
  }
  return {
    ok: true,
    commentId,
    comment: normalizeComment(body as NotionComment),
    limited: false,
  };
}

function buildCommentsURL(input: CommentsListInput): string {
  const url = new URL("https://api.notion.com/v1/comments");
  url.searchParams.set("block_id", input.blockId);
  if (typeof input.cursor === "string") {
    url.searchParams.set("start_cursor", input.cursor);
  }
  if (typeof input.pageSize === "number") {
    url.searchParams.set("page_size", String(input.pageSize));
  }
  return url.toString();
}

function buildCreateCommentPayload(input: CommentsCreateInput): Record<string, unknown> {
  return {
    parent: {
      page_id: input.pageId,
    },
    rich_text: [{
      text: {
        content: input.text,
      },
    }],
  };
}
