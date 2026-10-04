export type SalesforceChatterUser = {
  id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  isActive?: boolean;
  userType?: string;
  companyName?: string;
  url?: string;
  [key: string]: unknown;
};

export type NormalizedUser = {
  id: string;
  provider: "salesforce";
  providerUserId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  isActive: boolean;
  userType: string;
  companyName: string;
  modelVersion: "2026-05-16";
  raw: SalesforceChatterUser;
};

export function normalizeUser(user: SalesforceChatterUser): NormalizedUser {
  return {
    id: `sf-user:${user.id}`,
    provider: "salesforce",
    providerUserId: user.id,
    username: user.username ?? "",
    email: user.email ?? "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    isActive: user.isActive ?? false,
    userType: user.userType ?? "",
    companyName: user.companyName ?? "",
    modelVersion: "2026-05-16",
    raw: user,
  };
}

export function validateGetMeInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("get current user input must be an object");
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
