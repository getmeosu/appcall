export type NotionBlock = {
  object?: string;
  id?: string;
  type?: string;
  has_children?: boolean;
  [key: string]: unknown;
};

export type NormalizedBlock = {
  id: string;
  provider: "notion";
  providerBlockId: string;
  blockType: string;
  text: string | null;
  hasChildren: boolean;
  children?: NormalizedBlock[];
  modelVersion: "2026-05-14";
  raw: NotionBlock;
};

export function normalizeBlock(block: NotionBlock, children?: NormalizedBlock[]): NormalizedBlock {
  const providerBlockId = requireString(block.id, "block.id");
  const blockType = typeof block.type === "string" && block.type.length > 0 ? block.type : "unknown";

  return {
    id: `notion:${providerBlockId}`,
    provider: "notion",
    providerBlockId,
    blockType,
    text: readPlainText(block, blockType),
    hasChildren: block.has_children === true,
    children,
    modelVersion: "2026-05-14",
    raw: block,
  };
}

export function parseNextCursor(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }
  const cursor = response.next_cursor;
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

function readPlainText(block: NotionBlock, blockType: string): string | null {
  const value = block[blockType];
  if (!isRecord(value) || !Array.isArray(value.rich_text)) {
    return null;
  }
  const text = value.rich_text
    .map((part) => isRecord(part) && typeof part.plain_text === "string" ? part.plain_text : "")
    .join("")
    .trim();
  return text.length > 0 ? text : null;
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
