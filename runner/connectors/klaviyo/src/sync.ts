import { parseContactsResponse } from "./objects"; import type { NormalizedContact } from "./objects";
import { parseCampaignsResponse } from "./objects"; import type { NormalizedCampaign } from "./objects";
import { parseListsResponse } from "./objects"; import type { NormalizedList } from "./objects";

export type ContactsListSyncInput = { response: unknown };
export type ContactsListSyncResult = { provider: "klaviyo"; operation: "contacts.list"; items: NormalizedContact[]; nextPageToken: string | null };
export function executeContactsListSync(input: ContactsListSyncInput): ContactsListSyncResult { const p = parseContactsResponse(input.response); return { provider: "klaviyo", operation: "contacts.list", items: p.contacts, nextPageToken: p.nextPageToken }; }

export type CampaignsListSyncInput = { response: unknown };
export type CampaignsListSyncResult = { provider: "klaviyo"; operation: "campaigns.list"; items: NormalizedCampaign[]; nextPageToken: string | null };
export function executeCampaignsListSync(input: CampaignsListSyncInput): CampaignsListSyncResult { const p = parseCampaignsResponse(input.response); return { provider: "klaviyo", operation: "campaigns.list", items: p.campaigns, nextPageToken: p.nextPageToken }; }

export type ListsListSyncInput = { response: unknown };
export type ListsListSyncResult = { provider: "klaviyo"; operation: "lists.list"; items: NormalizedList[]; nextPageToken: string | null };
export function executeListsListSync(input: ListsListSyncInput): ListsListSyncResult { const p = parseListsResponse(input.response); return { provider: "klaviyo", operation: "lists.list", items: p.lists, nextPageToken: p.nextPageToken }; }
