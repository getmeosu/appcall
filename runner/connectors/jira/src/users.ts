import { prop } from "./http";

export type NormalizedUser = {
  id: string;
  provider: "jira";
  providerUserId: string;
  displayName: string;
  emailAddress: string;
  accountId: string;
  active: boolean;
  timeZone: string;
  locale: string;
  avatarUrl: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeUser(data: Record<string, unknown>): NormalizedUser {
  const avatarUrls = isRecord(data.avatarUrls) ? data.avatarUrls : {};
  return {
    id: `jira-user:${prop(data, "accountId")}`,
    provider: "jira",
    providerUserId: prop(data, "accountId"),
    displayName: prop(data, "displayName"),
    emailAddress: prop(data, "emailAddress"),
    accountId: prop(data, "accountId"),
    active: data.active === true,
    timeZone: prop(data, "timeZone"),
    locale: prop(data, "locale"),
    avatarUrl: prop(avatarUrls, "48x48"),
    modelVersion: "2026-05-16",
    raw: data,
  };
}

export function parseUsersResponse(response: unknown): { users: NormalizedUser[]; nextStart: number | null } {
  if (!isRecord(response)) return { users: [], nextStart: null };
  const values = response.values;
  if (!Array.isArray(values)) return { users: [], nextStart: null };
  const start = typeof response.startAt === "number" ? response.startAt : 0;
  const max = typeof response.maxResults === "number" ? response.maxResults : 50;
  const total = typeof response.total === "number" ? response.total : 0;
  const nextStart = start + max < total ? start + max : null;
  return {
    users: values.filter(isRecord).map(normalizeUser),
    nextStart,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
