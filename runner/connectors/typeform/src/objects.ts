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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
