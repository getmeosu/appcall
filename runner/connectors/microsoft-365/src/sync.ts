import { normalizeOutlookMessage, parseMessagesResponse, type NormalizedMessage } from "./messages";
import { normalizeCalendarEvent, parseEventsResponse, parseCalendarsResponse, type NormalizedEvent, type Calendar } from "./events";
import { normalizeDriveFile, parseFilesResponse, type NormalizedFile } from "./files";

export type MessagesListSyncInput = { response: unknown };
export type MessagesListSyncResult = { provider: "microsoft-365"; operation: "messages.list"; items: NormalizedMessage[]; nextLink: string | null };

export function executeMessagesListSync(input: MessagesListSyncInput): MessagesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseMessagesResponse(response);
  return { provider: "microsoft-365", operation: "messages.list", items: parsed.messages.map((m) => normalizeOutlookMessage(m)), nextLink: parsed.nextLink };
}

export type EventsListSyncInput = { response: unknown };
export type EventsListSyncResult = { provider: "microsoft-365"; operation: "events.list"; items: NormalizedEvent[]; nextLink: string | null };

export function executeEventsListSync(input: EventsListSyncInput): EventsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseEventsResponse(response);
  const nonCancelled = parsed.events.filter((e) => e.isCancelled !== true);
  return { provider: "microsoft-365", operation: "events.list", items: nonCancelled.map((e) => normalizeCalendarEvent(e)), nextLink: parsed.nextLink };
}

export type CalendarsListSyncInput = { response: unknown };
export type CalendarsListSyncResult = { provider: "microsoft-365"; operation: "calendars.list"; items: Calendar[] };

export function executeCalendarsListSync(input: CalendarsListSyncInput): CalendarsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseCalendarsResponse(response);
  return { provider: "microsoft-365", operation: "calendars.list", items: parsed.calendars };
}

export type FilesListSyncInput = { response: unknown };
export type FilesListSyncResult = { provider: "microsoft-365"; operation: "files.list"; items: NormalizedFile[]; nextLink: string | null };

export function executeFilesListSync(input: FilesListSyncInput): FilesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseFilesResponse(response);
  return { provider: "microsoft-365", operation: "files.list", items: parsed.files.map((f) => normalizeDriveFile(f)), nextLink: parsed.nextLink };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}
