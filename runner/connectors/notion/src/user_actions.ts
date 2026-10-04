import { type ConnectorHttpClient } from "../../../bun/src/http";
import { normalizeUser, type NormalizedUser, type NotionUser } from "./users";
import {
  isRecord,
  mapNotionUserError,
  notionVersion,
  readJsonObject,
  requireNonEmptyString,
} from "./http";

export type UsersMeInput = Record<string, never>;
export type UsersGetInput = { userId: string };

export type UsersMeResult =
  | { ok: true; user: NormalizedUser }
  | { ok: false; error: Record<string, unknown> };

export type UsersGetResult =
  | { ok: true; user: NormalizedUser }
  | { ok: false; error: Record<string, unknown> };

export function validateUsersMeInput(input: unknown): UsersMeInput {
  if (!isRecord(input)) {
    throw new Error("users me input must be an object");
  }
  return {};
}

export function validateUsersGetInput(input: unknown): UsersGetInput {
  if (!isRecord(input)) {
    throw new Error("users get input must be an object");
  }
  return { userId: requireNonEmptyString(input.userId, "userId") };
}

export async function getNotionCurrentUser(
  httpClient: ConnectorHttpClient,
  notionToken: string,
): Promise<UsersMeResult> {
  const response = await httpClient.fetchText("https://api.notion.com/v1/users/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": notionVersion,
    },
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionUserError(response.status, response.headers, body) };
  }
  return { ok: true, user: normalizeUser(body as NotionUser) };
}

export async function getNotionUser(
  httpClient: ConnectorHttpClient,
  notionToken: string,
  input: UsersGetInput,
): Promise<UsersGetResult> {
  const response = await httpClient.fetchText(`https://api.notion.com/v1/users/${encodeURIComponent(input.userId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": notionVersion,
    },
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapNotionUserError(response.status, response.headers, body) };
  }
  return { ok: true, user: normalizeUser(body as NotionUser) };
}
