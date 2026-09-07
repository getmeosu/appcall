import { parseContactsResponse, normalizeContact, type NormalizedContact } from "./objects";
import { parseCompaniesResponse, normalizeCompany, type NormalizedCompany } from "./objects";
import { parseDealsResponse, normalizeDeal, type NormalizedDeal } from "./objects";
import { parseTicketsResponse, normalizeTicket, type NormalizedTicket } from "./objects";

export type ContactsListSyncInput = { response: unknown };
export type ContactsListSyncResult = { provider: "hubspot"; operation: "contacts.list"; items: NormalizedContact[]; nextCursor: string | null };

export function executeContactsListSync(input: ContactsListSyncInput): ContactsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseContactsResponse(response);
  return { provider: "hubspot", operation: "contacts.list", items: parsed.contacts.map((c) => normalizeContact(c)), nextCursor: parsed.nextCursor };
}

export type CompaniesListSyncInput = { response: unknown };
export type CompaniesListSyncResult = { provider: "hubspot"; operation: "companies.list"; items: NormalizedCompany[]; nextCursor: string | null };

export function executeCompaniesListSync(input: CompaniesListSyncInput): CompaniesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseCompaniesResponse(response);
  return { provider: "hubspot", operation: "companies.list", items: parsed.companies.map((c) => normalizeCompany(c)), nextCursor: parsed.nextCursor };
}

export type DealsListSyncInput = { response: unknown };
export type DealsListSyncResult = { provider: "hubspot"; operation: "deals.list"; items: NormalizedDeal[]; nextCursor: string | null };

export function executeDealsListSync(input: DealsListSyncInput): DealsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseDealsResponse(response);
  return { provider: "hubspot", operation: "deals.list", items: parsed.deals.map((d) => normalizeDeal(d)), nextCursor: parsed.nextCursor };
}

export type TicketsListSyncInput = { response: unknown };
export type TicketsListSyncResult = { provider: "hubspot"; operation: "tickets.list"; items: NormalizedTicket[]; nextCursor: string | null };

export function executeTicketsListSync(input: TicketsListSyncInput): TicketsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseTicketsResponse(response);
  return { provider: "hubspot", operation: "tickets.list", items: parsed.tickets.map((t) => normalizeTicket(t)), nextCursor: parsed.nextCursor };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}
