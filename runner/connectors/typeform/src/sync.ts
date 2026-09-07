import {
  parseFormsResponse,
  normalizeForm,
  type NormalizedForm,
} from "./objects";
import {
  parseResponsesResponse,
  normalizeResponse,
  type NormalizedResponse,
} from "./objects";

export type FormsListSyncInput = { response: unknown };
export type FormsListSyncResult = {
  provider: "typeform";
  operation: "forms.list";
  items: NormalizedForm[];
  nextCursor: string | null;
};

export function executeFormsListSync(input: FormsListSyncInput): FormsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseFormsResponse(response);
  return {
    provider: "typeform",
    operation: "forms.list",
    items: parsed.forms.map((f) => normalizeForm(f)),
    nextCursor: parsed.nextCursor,
  };
}

export type ResponsesListSyncInput = { response: unknown };
export type ResponsesListSyncResult = {
  provider: "typeform";
  operation: "responses.list";
  items: NormalizedResponse[];
  nextCursor: string | null;
};

export function executeResponsesListSync(
  input: ResponsesListSyncInput,
): ResponsesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseResponsesResponse(response);
  return {
    provider: "typeform",
    operation: "responses.list",
    items: parsed.responses.map((r) => normalizeResponse(r)),
    nextCursor: parsed.nextCursor,
  };
}

function requireRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
