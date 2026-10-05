export type NormalizedProfile = {
  id: string;
  provider: "linkedin";
  providerProfileId: string;
  firstName: string;
  lastName: string;
  email: string;
  headline: string;
  avatarUrl: string;
  vanityName: string;
  industry: string;
  locality: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

/**
 * Sign In with LinkedIn using OpenID Connect profile endpoint (scopes openid, profile, email).
 * Replaces the legacy Sign In with LinkedIn /v2/me + /v2/emailAddress pair.
 */
export const LINKEDIN_USERINFO_PATH = "/v2/userinfo";

/**
 * Normalizes an OpenID Connect /v2/userinfo response (sub, given_name, family_name, name,
 * picture, email). Legacy /v2/me fields are still read as fallbacks so cached or
 * legacy-scope responses keep parsing during rollout.
 */
export function normalizeProfile(data: Record<string, unknown>): NormalizedProfile {
  const id = extractString(data, "sub") || extractString(data, "id");
  const [nameFirst, nameLast] = splitFullName(extractString(data, "name"));
  const firstName =
    extractString(data, "given_name") ||
    extractLocalizedField(data, "localizedFirstName") ||
    extractString(data, "firstName") ||
    nameFirst;
  const lastName =
    extractString(data, "family_name") ||
    extractLocalizedField(data, "localizedLastName") ||
    extractString(data, "lastName") ||
    nameLast;
  const email = extractString(data, "email") || extractEmailAddress(data);
  const headline = extractLocalizedField(data, "localizedHeadline") || extractLocalizedField(data, "headline") || extractString(data, "headline");

  let avatarUrl = extractString(data, "picture");
  const profilePicture = data.profilePicture;
  if (!avatarUrl && isRecord(profilePicture)) {
    const displayImage = profilePicture["displayImage~"];
    if (isRecord(displayImage)) {
      const elements = displayImage.elements;
      if (Array.isArray(elements) && elements.length > 0) {
        const first = elements[0];
        if (isRecord(first)) {
          const identifiers = first.identifiers;
          if (Array.isArray(identifiers) && identifiers.length > 0 && isRecord(identifiers[0])) {
            avatarUrl = extractString(identifiers[0], "content") || extractString(identifiers[0], "identifier");
          }
        }
      }
    }
  }

  return {
    id: `li-profile:${id}`,
    provider: "linkedin",
    providerProfileId: id,
    firstName,
    lastName,
    email,
    headline,
    avatarUrl,
    vanityName: extractString(data, "vanityName"),
    industry: extractString(data, "industry"),
    locality: extractString(data, "locality"),
    modelVersion: "2026-05-16",
    raw: data,
  };
}

export function parseProfileResponse(response: unknown): NormalizedProfile | null {
  if (!isRecord(response)) return null;
  return normalizeProfile(response);
}

function splitFullName(name: string): [string, string] {
  const trimmed = name.trim();
  if (!trimmed) return ["", ""];
  const space = trimmed.indexOf(" ");
  if (space === -1) return [trimmed, ""];
  return [trimmed.slice(0, space), trimmed.slice(space + 1).trim()];
}

function extractLocalizedField(data: Record<string, unknown>, field: string): string {
  const val = data[field];
  if (typeof val === "string") return val;
  if (isRecord(val)) {
    const preferred = val[Object.keys(val)[0]];
    if (typeof preferred === "string") return preferred;
  }
  return "";
}

function extractEmailAddress(data: Record<string, unknown>): string {
  const elements = data.elements;
  if (!Array.isArray(elements) || elements.length === 0) return "";
  const first = elements[0];
  if (!isRecord(first)) return "";
  const handle = first["handle~"];
  if (!isRecord(handle)) return "";
  return extractString(handle, "emailAddress");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(obj: Record<string, unknown>, field: string): string {
  const val = obj[field];
  return typeof val === "string" ? val : "";
}
