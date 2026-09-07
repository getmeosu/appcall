// Stand-in for @activepieces/pieces-common.
//
// `httpClient.sendRequest` records the request instead of issuing it and hands
// back an empty 200, which is enough for most action bodies to run to
// completion. An action that reads real response data will throw; the extractor
// treats that as "not mechanised" and flags it for a human rather than emitting
// a half-recovered template.

import { recordRequest } from "./recorder";

export const HttpMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
} as const;

export const AuthenticationType = {
  BEARER_TOKEN: "BEARER_TOKEN",
  BASIC: "BASIC",
  API_KEY: "API_KEY",
} as const;

export const httpClient = {
  async sendRequest(request: Record<string, unknown>) {
    recordRequest(request as never);
    return { status: 200, headers: {}, body: {} };
  },
};

export class HttpError extends Error {}

export function createCustomApiCallAction(options: Record<string, unknown>): Record<string, unknown> {
  // The generic "call any endpoint" escape hatch every piece ships. It is not a
  // real provider operation, so it is deliberately marked and then skipped.
  return { ...options, name: "custom_api_call", __customApiCall: true };
}

export const propsValidation = {
  validateZod: () => undefined,
};

export const AuthenticationTypeEnum = AuthenticationType;
