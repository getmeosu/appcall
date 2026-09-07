import { normalizeGmailMessage, parseMessagesListResponse, type NormalizedMessage } from "./messages";
import { normalizeDriveFile, parseFilesListResponse, type NormalizedFile } from "./files";
import { normalizeCalendarEvent, parseEventsListResponse, type NormalizedEvent } from "./events";
import { parseRowsResponse, parseWorksheetsResponse, type SheetRow, type Worksheet } from "./sheets";

export type MessagesListSyncInput = { response: unknown };
export type MessagesListSyncResult = { provider: "google-workspace"; operation: "messages.list"; items: NormalizedMessage[]; cursor: string | null };

export function executeMessagesListSync(input: MessagesListSyncInput): MessagesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseMessagesListResponse(response);
  return { provider: "google-workspace", operation: "messages.list", items: parsed.messages.map((msg) => normalizeGmailMessage(msg)), cursor: parsed.nextPageToken };
}

export type FilesListSyncInput = { response: unknown };
export type FilesListSyncResult = { provider: "google-workspace"; operation: "files.list"; items: NormalizedFile[]; cursor: string | null };

export function executeFilesListSync(input: FilesListSyncInput): FilesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseFilesListResponse(response);
  const nonTrashed = parsed.files.filter((f) => f.trashed !== true);
  return { provider: "google-workspace", operation: "files.list", items: nonTrashed.map((f) => normalizeDriveFile(f)), cursor: parsed.nextPageToken };
}

export type EventsListSyncInput = { response: unknown };
export type EventsListSyncResult = { provider: "google-workspace"; operation: "events.list"; items: NormalizedEvent[]; cursor: string | null };

export function executeEventsListSync(input: EventsListSyncInput): EventsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseEventsListResponse(response);
  const nonCancelled = parsed.events.filter((e) => e.status !== "cancelled");
  return { provider: "google-workspace", operation: "events.list", items: nonCancelled.map((e) => normalizeCalendarEvent(e)), cursor: parsed.nextPageToken };
}

export type SheetsRowsSyncInput = { response: unknown; spreadsheetId: string; sheetName?: string };
export type SheetsRowsSyncResult = { provider: "google-workspace"; operation: "sheets.rows.list"; items: SheetRow[] };

export function executeSheetsRowsSync(input: SheetsRowsSyncInput): SheetsRowsSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseRowsResponse(response, input.spreadsheetId ?? "", input.sheetName ?? "");
  return { provider: "google-workspace", operation: "sheets.rows.list", items: parsed.rows };
}

export type SheetsWorksheetsSyncInput = { response: unknown };
export type SheetsWorksheetsSyncResult = { provider: "google-workspace"; operation: "sheets.worksheets.list"; items: Worksheet[] };

export function executeSheetsWorksheetsSync(input: SheetsWorksheetsSyncInput): SheetsWorksheetsSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseWorksheetsResponse(response);
  return { provider: "google-workspace", operation: "sheets.worksheets.list", items: parsed.worksheets };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
