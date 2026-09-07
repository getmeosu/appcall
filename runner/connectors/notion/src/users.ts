export type NotionUser = {
  object?: string;
  id?: string;
  name?: string | null;
  avatar_url?: string | null;
  type?: string;
  person?: {
    email?: string;
  };
  [key: string]: unknown;
};

export type NormalizedUser = {
  id: string;
  provider: "notion";
  providerUserId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  userType: string;
  modelVersion: "2026-05-14";
  raw: NotionUser;
};

export function normalizeUser(user: NotionUser): NormalizedUser {
  const providerUserId = requireString(user.id, "user.id");
  const userType = typeof user.type === "string" && user.type.length > 0 ? user.type : "unknown";

  return {
    id: `notion:${providerUserId}`,
    provider: "notion",
    providerUserId,
    displayName: typeof user.name === "string" ? user.name : null,
    email: userType === "person" && isRecord(user.person) && typeof user.person.email === "string"
      ? user.person.email
      : null,
    avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
    userType,
    modelVersion: "2026-05-14",
    raw: user,
  };
}

export function parseNextCursor(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }
  const cursor = response.next_cursor;
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
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
