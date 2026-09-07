import { parseContactsResponse } from "./objects"; import type { NormalizedContact } from "./objects";
import { parseAudiencesResponse } from "./objects"; import type { NormalizedAudience } from "./objects";
import { parseCampaignsResponse } from "./objects"; import type { NormalizedCampaign } from "./objects";

export type ContactsListSyncInput = { response: unknown };
export type ContactsListSyncResult = { provider: "mailchimp"; operation: "contacts.list"; items: NormalizedContact[]; total: number };

export function executeContactsListSync(input: ContactsListSyncInput): ContactsListSyncResult {
  const parsed = parseContactsResponse(input.response);
  return { provider: "mailchimp", operation: "contacts.list", items: parsed.contacts, total: parsed.total };
}

export type AudiencesListSyncInput = { response: unknown };
export type AudiencesListSyncResult = { provider: "mailchimp"; operation: "audiences.list"; items: NormalizedAudience[] };

export function executeAudiencesListSync(input: AudiencesListSyncInput): AudiencesListSyncResult {
  return { provider: "mailchimp", operation: "audiences.list", items: parseAudiencesResponse(input.response).audiences };
}

export type CampaignsListSyncInput = { response: unknown };
export type CampaignsListSyncResult = { provider: "mailchimp"; operation: "campaigns.list"; items: NormalizedCampaign[] };

export function executeCampaignsListSync(input: CampaignsListSyncInput): CampaignsListSyncResult {
  return { provider: "mailchimp", operation: "campaigns.list", items: parseCampaignsResponse(input.response).campaigns };
}
