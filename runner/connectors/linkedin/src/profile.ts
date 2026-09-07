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

export function normalizeProfile(data: Record<string, unknown>): NormalizedProfile {
  const id = extractString(data, "id") || extractString(data, "localizedName") ? extractString(data, "id") : "";
  const firstName = extractLocalizedField(data, "localizedFirstName") || extractString(data, "firstName");
  const lastName = extractLocalizedField(data, "localizedLastName") || extractString(data, "lastName");
  const email = extractString(data, "email") || extractEmailAddress(data);
  const headline = extractLocalizedField(data, "localizedHeadline") || extractLocalizedField(data, "headline") || extractString(data, "headline");

  let avatarUrl = "";
  const profilePicture = data.profilePicture;
  if (isRecord(profilePicture)) {
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
