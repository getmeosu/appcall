import { normalizeContact, parseContactsResponse, type NormalizedContact } from "./contacts";
import { normalizeLead, parseLeadsResponse, type NormalizedLead } from "./leads";
import { normalizeAccount, parseAccountsResponse, type NormalizedAccount } from "./accounts";
import { normalizeOpportunity, parseOpportunitiesResponse, type NormalizedOpportunity } from "./opportunities";
import { normalizeCase, parseCasesResponse, type NormalizedCase } from "./cases";

export type ContactsListSyncInput = { response: unknown };
export type ContactsListSyncResult = { provider: "salesforce"; operation: "contacts.list"; items: NormalizedContact[]; nextLink: string | null };

export function executeContactsListSync(input: ContactsListSyncInput): ContactsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseContactsResponse(response);
  return { provider: "salesforce", operation: "contacts.list", items: parsed.contacts.map((c) => normalizeContact(c)), nextLink: parsed.nextLink };
}

export type LeadsListSyncInput = { response: unknown };
export type LeadsListSyncResult = { provider: "salesforce"; operation: "leads.list"; items: NormalizedLead[]; nextLink: string | null };

export function executeLeadsListSync(input: LeadsListSyncInput): LeadsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseLeadsResponse(response);
  return { provider: "salesforce", operation: "leads.list", items: parsed.leads.map((l) => normalizeLead(l)), nextLink: parsed.nextLink };
}

export type AccountsListSyncInput = { response: unknown };
export type AccountsListSyncResult = { provider: "salesforce"; operation: "accounts.list"; items: NormalizedAccount[]; nextLink: string | null };

export function executeAccountsListSync(input: AccountsListSyncInput): AccountsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseAccountsResponse(response);
  return { provider: "salesforce", operation: "accounts.list", items: parsed.accounts.map((a) => normalizeAccount(a)), nextLink: parsed.nextLink };
}

export type OpportunitiesListSyncInput = { response: unknown };
export type OpportunitiesListSyncResult = { provider: "salesforce"; operation: "opportunities.list"; items: NormalizedOpportunity[]; nextLink: string | null };

export function executeOpportunitiesListSync(input: OpportunitiesListSyncInput): OpportunitiesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseOpportunitiesResponse(response);
  return { provider: "salesforce", operation: "opportunities.list", items: parsed.opportunities.map((o) => normalizeOpportunity(o)), nextLink: parsed.nextLink };
}

export type CasesListSyncInput = { response: unknown };
export type CasesListSyncResult = { provider: "salesforce"; operation: "cases.list"; items: NormalizedCase[]; nextLink: string | null };

export function executeCasesListSync(input: CasesListSyncInput): CasesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseCasesResponse(response);
  return { provider: "salesforce", operation: "cases.list", items: parsed.cases.map((c) => normalizeCase(c)), nextLink: parsed.nextLink };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}
