import { extractAdfText, prop, propNum } from "./http";

export type NormalizedComment = {
  id: string;
  provider: "jira";
  providerCommentId: string;
  issueKey: string;
  body: string;
  authorId: string;
  authorName: string;
  created: string;
  updated: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeComment(data: Record<string, unknown>, issueKey: string = ""): NormalizedComment {
  const author = isRecord(data.author) ? data.author : {};
  return {
    id: `jira-comment:${prop(data, "id")}`,
    provider: "jira",
    providerCommentId: prop(data, "id"),
    issueKey,
    body: extractAdfText(data.body),
    authorId: prop(author, "accountId"),
    authorName: prop(author, "displayName"),
    created: prop(data, "created"),
    updated: prop(data, "updated"),
    modelVersion: "2026-05-16",
    raw: data,
  };
}

export function parseCommentsResponse(response: unknown, issueKey: string = ""): { comments: NormalizedComment[]; total: number } {
  if (!isRecord(response)) return { comments: [], total: 0 };
  const comments = response.comments;
  if (!Array.isArray(comments)) return { comments: [], total: 0 };
  return {
    comments: comments.filter(isRecord).map((c) => normalizeComment(c, issueKey)),
    total: propNum(response, "total"),
  };
}

export type NormalizedTransition = {
  id: string;
  name: string;
  toStatusId: string;
  toStatusName: string;
  toStatusCategoryName: string;
  hasScreen: boolean;
  isGlobal: boolean;
  isAvailable: boolean;
};

export function normalizeTransition(data: Record<string, unknown>): NormalizedTransition {
  const to = isRecord(data.to) ? data.to : {};
  const statusCategory = isRecord((to as any).statusCategory) ? (to as any).statusCategory : {};
  return {
    id: prop(data, "id"),
    name: prop(data, "name"),
    toStatusId: prop(to, "id"),
    toStatusName: prop(to, "name"),
    toStatusCategoryName: prop(statusCategory, "name"),
    hasScreen: data.hasScreen === true,
    isGlobal: data.isGlobal === true,
    isAvailable: data.isAvailable === true,
  };
}

export function parseTransitionsResponse(response: unknown): { transitions: NormalizedTransition[] } {
  if (!isRecord(response)) return { transitions: [] };
  const transitions = response.transitions;
  if (!Array.isArray(transitions)) return { transitions: [] };
  return {
    transitions: transitions.filter(isRecord).map(normalizeTransition),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
