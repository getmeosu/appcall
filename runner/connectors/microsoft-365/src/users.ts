import { createGraphClient, parseGraphRateLimit, type GraphClient } from "./http";

export type GraphUser = {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  mobilePhone?: string;
  officeLocation?: string;
  [key: string]: unknown;
};

export function parseGraphUser(value: unknown): GraphUser {
  if (!isRecord(value)) throw new Error("id is required");
  return {
    id: requireString(value.id, "id"),
    displayName: typeof value.displayName === "string" ? value.displayName : undefined,
    givenName: typeof value.givenName === "string" ? value.givenName : undefined,
    surname: typeof value.surname === "string" ? value.surname : undefined,
    mail: typeof value.mail === "string" ? value.mail : undefined,
    userPrincipalName: typeof value.userPrincipalName === "string" ? value.userPrincipalName : undefined,
    jobTitle: typeof value.jobTitle === "string" ? value.jobTitle : undefined,
    mobilePhone: typeof value.mobilePhone === "string" ? value.mobilePhone : undefined,
    officeLocation: typeof value.officeLocation === "string" ? value.officeLocation : undefined,
  };
}

export type GetMeInput = Record<string, never>;

export function validateGetMeInput(input: unknown): GetMeInput {
  if (input !== undefined && !isRecord(input)) throw new Error("get me input must be an object");
  return {};
}

export function createUsersClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.me" });

  return {
    async me(input: unknown) {
      validateGetMeInput(input);
      const response = await client.fetchJSON("/v1.0/me");
      if (response.status === 200) {
        return { ok: true as const, user: parseGraphUser(response.body) };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the get me request." } };
    },
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
