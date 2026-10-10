import type { TypeFormForm, TypeFormResponse } from "./http";

export type NormalizedForm = {
  id: string;
  provider: "typeform";
  providerFormId: string;
  title: string;
  description: string;
  createdAt: string;
  lastUpdatedAt: string;
  numberOfResponses: number;
  modelVersion: "2026-05-17";
  raw: TypeFormForm;
};

export function normalizeForm(f: TypeFormForm): NormalizedForm {
  return {
    id: `tf-form:${f.id}`,
    provider: "typeform",
    providerFormId: f.id,
    title: f.title ?? "",
    description: f.description ?? "",
    createdAt: f.created_at ?? "",
    lastUpdatedAt: f.updated_at ?? "",
    numberOfResponses: 0,
    modelVersion: "2026-05-17",
    raw: f,
  };
}

export function parseFormsResponse(
  response: unknown,
): { forms: TypeFormForm[]; nextCursor: string | null } {
  if (!isRecord(response)) return { forms: [], nextCursor: null };
  const items = response.items;
  if (!Array.isArray(items)) return { forms: [], nextCursor: null };
  return {
    forms: items.filter(isRecord) as TypeFormForm[],
    nextCursor: extractPageCursor(response),
  };
}

export type NormalizedResponse = {
  id: string;
  provider: "typeform";
  providerResponseId: string;
  formId: string;
  submittedAt: string;
  landedAt: string;
  answerCount: number;
  modelVersion: "2026-05-17";
  raw: TypeFormResponse;
};

export function normalizeResponse(r: TypeFormResponse): NormalizedResponse {
  return {
    id: `tf-response:${r.id}`,
    provider: "typeform",
    providerResponseId: r.id,
    formId: r.form_id ?? "",
    submittedAt: r.submitted_at ?? "",
    landedAt: r.landed_at ?? "",
    answerCount: Array.isArray(r.answers) ? r.answers.length : 0,
    modelVersion: "2026-05-17",
    raw: r,
  };
}

export function parseResponsesResponse(
  response: unknown,
): { responses: TypeFormResponse[]; nextCursor: string | null } {
  if (!isRecord(response)) return { responses: [], nextCursor: null };
  const items = response.items;
  if (!Array.isArray(items)) return { responses: [], nextCursor: null };
  return {
    responses: items.filter(isRecord) as TypeFormResponse[],
    nextCursor: extractPageCursor(response),
  };
}

function extractPageCursor(
  response: Record<string, unknown>,
): string | null {
  const pageCount = response.page_count;
  if (typeof pageCount !== "number" || pageCount <= 1) return null;
  const currentPage = response.page;
  if (typeof currentPage !== "number") return null;
  if (currentPage < pageCount) return String(currentPage + 1);
  return null;
}

export type NormalizedWorkspace = {
  id: string;
  provider: "typeform";
  providerWorkspaceId: string;
  name: string;
  shared: boolean;
  formCount: number;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeWorkspace(w: Record<string, unknown>): NormalizedWorkspace {
  const forms = isRecord(w.forms) ? w.forms : {};
  return {
    id: `tf-workspace:${String(w.id ?? "")}`,
    provider: "typeform",
    providerWorkspaceId: String(w.id ?? ""),
    name: typeof w.name === "string" ? w.name : "",
    shared: typeof w.shared === "boolean" ? w.shared : false,
    formCount: typeof forms.count === "number" ? forms.count : 0,
    modelVersion: "2026-05-17",
    raw: w,
  };
}

export type NormalizedTheme = {
  id: string;
  provider: "typeform";
  providerThemeId: string;
  name: string;
  visibility: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeTheme(t: Record<string, unknown>): NormalizedTheme {
  return {
    id: `tf-theme:${String(t.id ?? "")}`,
    provider: "typeform",
    providerThemeId: String(t.id ?? ""),
    name: typeof t.name === "string" ? t.name : "",
    visibility: typeof t.visibility === "string" ? t.visibility : "",
    modelVersion: "2026-05-17",
    raw: t,
  };
}

export type NormalizedImage = {
  id: string;
  provider: "typeform";
  providerImageId: string;
  src: string;
  fileName: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeImage(i: Record<string, unknown>): NormalizedImage {
  return {
    id: `tf-image:${String(i.id ?? "")}`,
    provider: "typeform",
    providerImageId: String(i.id ?? ""),
    src: typeof i.src === "string" ? i.src : "",
    fileName: typeof i.file_name === "string" ? i.file_name : "",
    modelVersion: "2026-05-17",
    raw: i,
  };
}

export type NormalizedUser = {
  id: string;
  provider: "typeform";
  email: string;
  alias: string;
  language: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeUser(u: Record<string, unknown>): NormalizedUser {
  return {
    id: `tf-user:${String(u.user_id ?? u.email ?? "")}`,
    provider: "typeform",
    email: typeof u.email === "string" ? u.email : "",
    alias: typeof u.alias === "string" ? u.alias : "",
    language: typeof u.language === "string" ? u.language : "",
    modelVersion: "2026-05-17",
    raw: u,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
