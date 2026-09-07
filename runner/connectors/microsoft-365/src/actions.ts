import { createOutlookClient, validateSendMessageInput, createGetMessageClient, validateGetMessageInput, createReplyMessageClient, validateReplyMessageInput, createMoveMessageClient, validateMoveMessageInput, createDeleteMessageClient, validateDeleteMessageInput, createMailFoldersClient } from "./messages";
import { createEventsClient, validateCreateEventInput, validateUpdateEventInput, validateDeleteEventInput, validateGetEventInput } from "./events";
import { createDriveItemsClient, validateGetDriveItemInput, validateDeleteDriveItemInput, validateCopyDriveItemInput } from "./files";
import { createContactsClient, validateCreateContactInput, validateListContactsInput } from "./contacts";
import { createTeamsMeetingsClient, validateCreateMeetingInput, validateGetMeetingInput, validateUpdateMeetingInput, validateDeleteMeetingInput, validateGetMeetingByJoinUrlInput, validateCreateCalendarTeamsEventInput } from "./teams";

export function sendMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createOutlookClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).send(input).then((result) => {
      if (!result.ok) {
        throw {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          retryAfterSeconds: result.error.retryAfterSeconds,
        };
      }
      return { connector: "microsoft-365", action: "messages.send", source: "connector", sent: true };
    });
  }
  return { connector: "microsoft-365", action: "messages.send", source: "connector", validated: validateSendMessageInput(input) };
}

export function getMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGetMessageClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "messages.get", source: "connector", message: result.message };
    });
  }
  return { connector: "microsoft-365", action: "messages.get", source: "connector", validated: validateGetMessageInput(input) };
}

export function replyMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReplyMessageClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).reply(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "messages.reply", source: "connector", replied: true };
    });
  }
  return { connector: "microsoft-365", action: "messages.reply", source: "connector", validated: validateReplyMessageInput(input) };
}

export function moveMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMoveMessageClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).move(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "messages.move", source: "connector", messageId: result.messageId };
    });
  }
  return { connector: "microsoft-365", action: "messages.move", source: "connector", validated: validateMoveMessageInput(input) };
}

export function deleteMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeleteMessageClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "messages.delete", source: "connector", deleted: true };
    });
  }
  return { connector: "microsoft-365", action: "messages.delete", source: "connector", validated: validateDeleteMessageInput(input) };
}

export function listMailFolders(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMailFoldersClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "mailFolders.list", source: "connector", folders: result.folders };
    });
  }
  return { connector: "microsoft-365", action: "mailFolders.list", source: "connector", validated: {} };
}

export function createEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createEventsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "events.create", source: "connector", event: result.event };
    });
  }
  return { connector: "microsoft-365", action: "events.create", source: "connector", validated: validateCreateEventInput(input) };
}

export function updateEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createEventsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "events.update", source: "connector", event: result.event };
    });
  }
  return { connector: "microsoft-365", action: "events.update", source: "connector", validated: validateUpdateEventInput(input) };
}

export function deleteEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createEventsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "events.delete", source: "connector", deleted: true };
    });
  }
  return { connector: "microsoft-365", action: "events.delete", source: "connector", validated: validateDeleteEventInput(input) };
}

export function getEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createEventsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "events.get", source: "connector", event: result.event };
    });
  }
  return { connector: "microsoft-365", action: "events.get", source: "connector", validated: validateGetEventInput(input) };
}

export function getDriveItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDriveItemsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "drive.items.get", source: "connector", item: result.item };
    });
  }
  return { connector: "microsoft-365", action: "drive.items.get", source: "connector", validated: validateGetDriveItemInput(input) };
}

export function deleteDriveItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDriveItemsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "drive.items.delete", source: "connector", deleted: true };
    });
  }
  return { connector: "microsoft-365", action: "drive.items.delete", source: "connector", validated: validateDeleteDriveItemInput(input) };
}

export function copyDriveItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDriveItemsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).copy(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "drive.items.copy", source: "connector", operationUrl: result.operationUrl };
    });
  }
  return { connector: "microsoft-365", action: "drive.items.copy", source: "connector", validated: validateCopyDriveItemInput(input) };
}

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createContactsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "contacts.create", source: "connector", contact: result.contact };
    });
  }
  return { connector: "microsoft-365", action: "contacts.create", source: "connector", validated: validateCreateContactInput(input) };
}

export function listContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createContactsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "contacts.list", source: "connector", contacts: result.contacts };
    });
  }
  return { connector: "microsoft-365", action: "contacts.list", source: "connector", validated: validateListContactsInput(input) };
}

// ─── Teams Meetings Actions ───────────────────────────────────────────────────

export function createTeamsMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createTeamsMeetingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "teams_meetings.create", source: "connector", meeting: result.meeting };
    });
  }
  return { connector: "microsoft-365", action: "teams_meetings.create", source: "connector", validated: validateCreateMeetingInput(input) };
}

export function getTeamsMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createTeamsMeetingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "teams_meetings.get", source: "connector", meeting: result.meeting };
    });
  }
  return { connector: "microsoft-365", action: "teams_meetings.get", source: "connector", validated: validateGetMeetingInput(input) };
}

export function updateTeamsMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createTeamsMeetingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "teams_meetings.update", source: "connector", meeting: result.meeting };
    });
  }
  return { connector: "microsoft-365", action: "teams_meetings.update", source: "connector", validated: validateUpdateMeetingInput(input) };
}

export function deleteTeamsMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createTeamsMeetingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "teams_meetings.delete", source: "connector", deleted: true };
    });
  }
  return { connector: "microsoft-365", action: "teams_meetings.delete", source: "connector", validated: validateDeleteMeetingInput(input) };
}

export function getTeamsMeetingByJoinUrl(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createTeamsMeetingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getByJoinUrl(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "teams_meetings.get_by_join_url", source: "connector", meetings: result.meetings };
    });
  }
  return { connector: "microsoft-365", action: "teams_meetings.get_by_join_url", source: "connector", validated: validateGetMeetingByJoinUrlInput(input) };
}

export function createCalendarTeamsEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createTeamsMeetingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createCalendarTeamsEvent(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "microsoft-365", action: "calendar.event.create_teams", source: "connector", event: result.event };
    });
  }
  return { connector: "microsoft-365", action: "calendar.event.create_teams", source: "connector", validated: validateCreateCalendarTeamsEventInput(input) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
