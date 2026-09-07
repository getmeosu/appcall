import { type ConnectorHttpClient } from "../../../bun/src/http";
import { normalizeBlock, parseNextCursor as parseBlocksNextCursor, type NormalizedBlock, type NotionBlock } from "./blocks";
import {
  isRecord,
  mapNotionAppendBlocksError,
  mapNotionPageError,
  notionVersion,
  readDepth,
  readJsonObject,
  readPageSize,
  requireArray,
  requireNonEmptyString,
} from "./http";

export type BlocksListInput = {
  blockId: string;
  cursor?: string;
  depth?: number;
  pageSize?: number;
};

export type BlocksAppendInput = {
  blockId: string;
  text: string;
};

export type BlocksListResult =
  | { ok: true; blocks: NormalizedBlock[]; cursor: string | null }
  | { ok: false; error: Record<string, unknown> };

export type BlocksAppendResult =
  | { ok: true; blocks: NormalizedBlock[]; cursor: string | null }
  | { ok: false; error: Record<string, unknown> };

export function validateBlocksListInput(input: unknown): BlocksListInput {
  if (!isRecord(input)) {
    throw new Error("documents blocks list input must be an object");
  }
  const blockId = requireNonEmptyString(input.blockId, "blockId");
  const cursor = typeof input.cursor === "string" && input.cursor.trim().length > 0 ? input.cursor.trim() : undefined;
  const pageSize = input.pageSize === undefined ? undefined : readPageSize(input.pageSize);
  const depth = input.depth === undefined ? 1 : readDepth(input.depth);
  return { blockId, cursor, depth, pageSize };
}

export function validateBlocksAppendInput(input: unknown): BlocksAppendInput {
  if (!isRecord(input)) {
    throw new Error("documents blocks append input must be an object");
  }
  const blockId = requireNonEmptyString(input.blockId, "blockId");
  const text = requireNonEmptyString(input.text, "text");
  if (text.length > 2000) {
    throw new Error("text exceeds Notion paragraph limit");
  }
  return { blockId, text };
}

export async function listBlockChildren(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: BlocksListInput,
  currentDepth = 0,
): Promise<BlocksListResult> {
  const response = await httpClient.fetchText(buildBlockChildrenURL(input), {
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

  const blocks = requireArray(body.results, "results") as NotionBlock[];
  const normalized: NormalizedBlock[] = [];
  for (const block of blocks) {
    if (block.has_children === true && currentDepth + 1 < (input.depth ?? 1)) {
      const childResult = await listBlockChildren(httpClient, notionToken, {
        blockId: requireNonEmptyString(block.id, "block.id"),
        pageSize: input.pageSize,
        depth: input.depth,
      }, currentDepth + 1);
      if (!childResult.ok) {
        return childResult;
      }
      normalized.push(normalizeBlock(block, childResult.blocks));
      continue;
    }
    normalized.push(normalizeBlock(block));
  }

  return {
    ok: true,
    blocks: normalized,
    cursor: parseBlocksNextCursor(body),
  };
}

export async function appendDocumentTextBlock(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: BlocksAppendInput,
): Promise<BlocksAppendResult> {
  const response = await httpClient.fetchText(`https://api.notion.com/v1/blocks/${encodeURIComponent(input.blockId)}/children`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion,
    },
    body: JSON.stringify(buildAppendTextPayload(input)),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionAppendBlocksError(response.status, response.headers, body) };
  }
  const blocks = requireArray(body.results, "results") as NotionBlock[];
  return {
    ok: true,
    blocks: blocks.map((block) => normalizeBlock(block)),
    cursor: parseBlocksNextCursor(body),
  };
}

function buildBlockChildrenURL(input: BlocksListInput): string {
  const url = new URL(`https://api.notion.com/v1/blocks/${encodeURIComponent(input.blockId)}/children`);
  if (typeof input.cursor === "string") {
    url.searchParams.set("start_cursor", input.cursor);
  }
  if (typeof input.pageSize === "number") {
    url.searchParams.set("page_size", String(input.pageSize));
  }
  return url.toString();
}

function buildAppendTextPayload(input: BlocksAppendInput): Record<string, unknown> {
  return {
    children: [{
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{
          type: "text",
          text: {
            content: input.text,
          },
        }],
      },
    }],
  };
}
