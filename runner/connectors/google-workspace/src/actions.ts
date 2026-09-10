import { createGmailClient, validateSendMessageInput, validateGetMessageInput, validateModifyMessageInput, validateTrashMessageInput, validateCreateDraftInput } from "./messages";
import { createSheetsClient, validateGetValuesInput, validateAppendValuesInput, validateUpdateValuesInput, validateClearValuesInput, validateCreateSpreadsheetInput, validateBatchUpdateSpreadsheetInput } from "./sheets";
import { createDocsClient, validateGetDocumentInput, validateCreateDocumentInput } from "./docs";
import { createCalendarActionsClient, validateCreateEventInput, validateUpdateEventInput, validateDeleteEventInput, validateGetEventInput } from "./events";
import { createDriveActionsClient, validateGetFileInput, validateCreateDriveFileInput, validateDeleteFileInput, validateCreatePermissionInput } from "./files";

// ---- helpers ----

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number; providerError?: string } }): never {
  throw {
    ok: false,
    code: result.error.code,
    message: result.error.message,
    retryAfterSeconds: result.error.retryAfterSeconds,
    providerError: result.error.providerError,
  };
}

// =========================================================================
// Gmail: messages.send
// =========================================================================

export function sendMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGmailClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).send(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "messages.send",
        source: "connector",
        messageId: result.message.id,
        threadId: result.message.threadId,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "messages.send",
    source: "connector",
    validated: validateSendMessageInput(input),
  };
}

// =========================================================================
// Gmail: messages.get
// =========================================================================

export function getMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGmailClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getMessage(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "messages.get",
        source: "connector",
        ...result.message,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "messages.get",
    source: "connector",
    validated: validateGetMessageInput(input),
  };
}

// =========================================================================
// Gmail: messages.modify
// =========================================================================

export function modifyMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGmailClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).modifyMessage(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "messages.modify",
        source: "connector",
        id: result.message.id,
        threadId: result.message.threadId,
        labelIds: result.message.labelIds,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "messages.modify",
    source: "connector",
    validated: validateModifyMessageInput(input),
  };
}

// =========================================================================
// Gmail: messages.trash
// =========================================================================

export function trashMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGmailClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).trashMessage(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "messages.trash",
        source: "connector",
        id: result.message.id,
        threadId: result.message.threadId,
        labelIds: result.message.labelIds,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "messages.trash",
    source: "connector",
    validated: validateTrashMessageInput(input),
  };
}

// =========================================================================
// Gmail: drafts.create
// =========================================================================

export function createDraft(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGmailClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createDraft(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "drafts.create",
        source: "connector",
        draftId: result.draft.draftId,
        messageId: result.draft.messageId,
        threadId: result.draft.threadId,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "drafts.create",
    source: "connector",
    validated: validateCreateDraftInput(input),
  };
}

// =========================================================================
// Gmail: labels.list
// =========================================================================

export function listLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGmailClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listLabels().then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "labels.list",
        source: "connector",
        labels: result.labels,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "labels.list",
    source: "connector",
    validated: {},
  };
}

// =========================================================================
// Sheets: sheets.values.get
// =========================================================================

export function getSheetValues(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSheetsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getValues(input).then((result) => ({
      connector: "google-workspace",
      action: "sheets.values.get",
      source: "connector",
      spreadsheetId: result.spreadsheetId,
      range: result.range,
      majorDimension: result.majorDimension,
      values: result.values,
    }));
  }

  return {
    connector: "google-workspace",
    action: "sheets.values.get",
    source: "connector",
    validated: validateGetValuesInput(input),
  };
}

// =========================================================================
// Sheets: sheets.values.append
// =========================================================================

export function appendSheetValues(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSheetsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).appendValues(input).then((result) => ({
      connector: "google-workspace",
      action: "sheets.values.append",
      source: "connector",
      spreadsheetId: result.spreadsheetId,
      tableRange: result.tableRange,
      updatedRange: result.updatedRange,
      updatedRows: result.updatedRows,
      updatedColumns: result.updatedColumns,
      updatedCells: result.updatedCells,
    }));
  }

  return {
    connector: "google-workspace",
    action: "sheets.values.append",
    source: "connector",
    validated: validateAppendValuesInput(input),
  };
}

// =========================================================================
// Sheets: sheets.values.update
// =========================================================================

export function updateSheetValues(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSheetsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).updateValues(input).then((result) => ({
      connector: "google-workspace",
      action: "sheets.values.update",
      source: "connector",
      spreadsheetId: result.spreadsheetId,
      updatedRange: result.updatedRange,
      updatedRows: result.updatedRows,
      updatedColumns: result.updatedColumns,
      updatedCells: result.updatedCells,
    }));
  }

  return {
    connector: "google-workspace",
    action: "sheets.values.update",
    source: "connector",
    validated: validateUpdateValuesInput(input),
  };
}

// =========================================================================
// Sheets: sheets.values.clear
// =========================================================================

export function clearSheetValues(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSheetsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).clearValues(input).then((result) => ({
      connector: "google-workspace",
      action: "sheets.values.clear",
      source: "connector",
      spreadsheetId: result.spreadsheetId,
      clearedRange: result.clearedRange,
    }));
  }

  return {
    connector: "google-workspace",
    action: "sheets.values.clear",
    source: "connector",
    validated: validateClearValuesInput(input),
  };
}

// =========================================================================
// Sheets: sheets.spreadsheets.create
// =========================================================================

export function createSpreadsheet(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSheetsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createSpreadsheet(input).then((result) => ({
      connector: "google-workspace",
      action: "sheets.spreadsheets.create",
      source: "connector",
      spreadsheetId: result.spreadsheetId,
      spreadsheetUrl: result.spreadsheetUrl,
      title: result.title,
    }));
  }

  return {
    connector: "google-workspace",
    action: "sheets.spreadsheets.create",
    source: "connector",
    validated: validateCreateSpreadsheetInput(input),
  };
}

// =========================================================================
// Sheets: sheets.spreadsheets.batchUpdate
// =========================================================================

export function batchUpdateSpreadsheet(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSheetsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).batchUpdateSpreadsheet(input).then((result) => ({
      connector: "google-workspace",
      action: "sheets.spreadsheets.batchUpdate",
      source: "connector",
      spreadsheetId: result.spreadsheetId,
      replies: result.replies,
    }));
  }

  return {
    connector: "google-workspace",
    action: "sheets.spreadsheets.batchUpdate",
    source: "connector",
    validated: validateBatchUpdateSpreadsheetInput(input),
  };
}

// =========================================================================
// Docs: docs.get
// =========================================================================

export function getDocument(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDocsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getDocument(input).then((result) => ({
      connector: "google-workspace",
      action: "docs.get",
      source: "connector",
      documentId: result.documentId,
      title: result.title,
      revisionId: result.revisionId,
      body: result.body,
      ...(result.tabs === undefined ? {} : { tabs: result.tabs }),
    }));
  }

  return {
    connector: "google-workspace",
    action: "docs.get",
    source: "connector",
    validated: validateGetDocumentInput(input),
  };
}

// =========================================================================
// Docs: docs.create
// =========================================================================

export function createDocument(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDocsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createDocument(input).then((result) => ({
      connector: "google-workspace",
      action: "docs.create",
      source: "connector",
      documentId: result.documentId,
      title: result.title,
      revisionId: result.revisionId,
    }));
  }

  return {
    connector: "google-workspace",
    action: "docs.create",
    source: "connector",
    validated: validateCreateDocumentInput(input),
  };
}

// =========================================================================
// Calendar: calendar.events.create
// =========================================================================

export function createCalendarEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCalendarActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createEvent(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "calendar.events.create",
        source: "connector",
        ...result.event,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "calendar.events.create",
    source: "connector",
    validated: validateCreateEventInput(input),
  };
}

// =========================================================================
// Calendar: calendar.events.update
// =========================================================================

export function updateCalendarEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCalendarActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).updateEvent(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "calendar.events.update",
        source: "connector",
        ...result.event,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "calendar.events.update",
    source: "connector",
    validated: validateUpdateEventInput(input),
  };
}

// =========================================================================
// Calendar: calendar.events.delete
// =========================================================================

export function deleteCalendarEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCalendarActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).deleteEvent(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "calendar.events.delete",
        source: "connector",
        deleted: result.deleted,
        eventId: result.eventId,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "calendar.events.delete",
    source: "connector",
    validated: validateDeleteEventInput(input),
  };
}

// =========================================================================
// Calendar: calendar.events.get
// =========================================================================

export function getCalendarEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCalendarActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getEvent(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "calendar.events.get",
        source: "connector",
        ...result.event,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "calendar.events.get",
    source: "connector",
    validated: validateGetEventInput(input),
  };
}

// =========================================================================
// Calendar: calendar.calendars.list
// =========================================================================

export function listCalendars(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCalendarActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listCalendars(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "calendar.calendars.list",
        source: "connector",
        calendars: result.calendars,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "calendar.calendars.list",
    source: "connector",
    validated: {},
  };
}

// =========================================================================
// Drive: drive.files.get
// =========================================================================

export function getDriveFile(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDriveActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getFile(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "drive.files.get",
        source: "connector",
        ...result.file,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "drive.files.get",
    source: "connector",
    validated: validateGetFileInput(input),
  };
}

// =========================================================================
// Drive: drive.files.create
// =========================================================================

export function createDriveFile(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDriveActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createFile(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "drive.files.create",
        source: "connector",
        ...result.file,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "drive.files.create",
    source: "connector",
    validated: validateCreateDriveFileInput(input),
  };
}

// =========================================================================
// Drive: drive.files.delete
// =========================================================================

export function deleteDriveFile(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDriveActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).deleteFile(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "drive.files.delete",
        source: "connector",
        deleted: result.deleted,
        fileId: result.fileId,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "drive.files.delete",
    source: "connector",
    validated: validateDeleteFileInput(input),
  };
}

// =========================================================================
// Drive: drive.permissions.create
// =========================================================================

export function createDrivePermission(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDriveActionsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createPermission(input).then((result) => {
      if (!result.ok) throwError(result);
      return {
        connector: "google-workspace",
        action: "drive.permissions.create",
        source: "connector",
        permissionId: result.permission.permissionId,
        role: result.permission.role,
        type: result.permission.type,
        emailAddress: result.permission.emailAddress,
      };
    });
  }

  return {
    connector: "google-workspace",
    action: "drive.permissions.create",
    source: "connector",
    validated: validateCreatePermissionInput(input),
  };
}
