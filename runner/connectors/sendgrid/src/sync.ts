import { parseContactsResponse } from "./objects"; import type { NormalizedContact } from "./objects";
import { parseListsResponse } from "./objects"; import type { NormalizedList } from "./objects";
import { parseCampaignsResponse } from "./objects"; import type { NormalizedCampaign } from "./objects";

export type ContactsListSyncInput = { response: unknown };
export type ContactsListSyncResult = { provider: "sendgrid"; operation: "contacts.list"; items: NormalizedContact[]; nextPageToken: string | null };
export function executeContactsListSync(input: ContactsListSyncInput): ContactsListSyncResult { const p = parseContactsResponse(input.response); return { provider: "sendgrid", operation: "contacts.list", items: p.contacts, nextPageToken: p.nextPageToken }; }

export type ListsListSyncInput = { response: unknown };
export type ListsListSyncResult = { provider: "sendgrid"; operation: "lists.list"; items: NormalizedList[] };
export function executeListsListSync(input: ListsListSyncInput): ListsListSyncResult { return { provider: "sendgrid", operation: "lists.list", items: parseListsResponse(input.response).lists }; }

export type CampaignsListSyncInput = { response: unknown };
export type CampaignsListSyncResult = { provider: "sendgrid"; operation: "campaigns.list"; items: NormalizedCampaign[] };
export function executeCampaignsListSync(input: CampaignsListSyncInput): CampaignsListSyncResult { return { provider: "sendgrid", operation: "campaigns.list", items: parseCampaignsResponse(input.response).campaigns }; }
