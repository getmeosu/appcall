type JsonSchema = Record<string, unknown> & { type: string; description: string };
type SlackOperation = {
  method: string;
  title: string;
  description: string;
  properties: Record<string, JsonSchema>;
  required: string[];
  requiredAny?: string[];
  requiredGroups?: string[][];
  exclusive?: string[];
  csvFields?: string[];
};
type SlackExpandedHandler = (input: unknown) => Promise<Record<string, unknown>>;

const str = (description: string, opts: Record<string, unknown> = {}): JsonSchema => ({ type: "string", description, ...opts });
const bool = (description: string): JsonSchema => ({ type: "boolean", description });
const int = (description: string, minimum?: number, maximum?: number): JsonSchema => ({
  type: "integer",
  description,
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});
const strings = (description: string, minItems = 1): JsonSchema => ({
  type: "array",
  description,
  items: { type: "string", minLength: 1 },
  minItems,
  maxItems: 100,
});
const jsonObject = (description: string): JsonSchema => ({ type: "object", description });
const jsonObjects = (description: string, minItems = 1, maxItems = 100): JsonSchema => ({
  type: "array",
  description,
  items: { type: "object", description: "JSON object." },
  minItems,
  maxItems,
});
const canvasContent: JsonSchema = {
  type: "object",
  description: "Slack canvas document content. Markdown is limited to 1 MiB.",
  properties: {
    type: str("Canvas content type.", { enum: ["markdown"] }),
    markdown: str("Markdown body for the canvas."),
  },
  required: ["type"],
  additionalProperties: false,
};
const callUsers: JsonSchema = {
  type: "array",
  description: "Call participants. Each entry needs slack_id and/or external_id.",
  minItems: 1,
  maxItems: 100,
  items: {
    type: "object",
    description: "A Slack Calls participant.",
    properties: {
      slack_id: str("Slack user ID for this participant."),
      external_id: str("Third-party identifier for this participant."),
      display_name: str("Display name for an external participant."),
      avatar_url: str("HTTPS avatar URL for an external participant.", { format: "uri" }),
    },
    additionalProperties: false,
    anyOf: [{ required: ["slack_id"] }, { required: ["external_id"] }],
  },
};
const listField: JsonSchema = {
  type: "object",
  description: "A Slack List cell value keyed by column_id.",
  properties: {
    column_id: str("List column ID."),
    row_id: str("Existing List row ID, for example Rec0123456789."),
    rich_text: jsonObjects("Block Kit rich_text value for a text column."),
    user: strings("User IDs for a user column."),
    date: strings("ISO-8601 dates for a date column."),
    select: strings("Select option values."),
    checkbox: bool("Checkbox value."),
    number: { type: "array", description: "Numeric values for a number column.", items: { type: "number", description: "Numeric cell value." }, minItems: 1, maxItems: 20 },
    email: strings("Email addresses."),
    phone: strings("Phone numbers."),
    attachment: strings("Slack file IDs for an attachment column."),
    message: strings("Message permalinks."),
    rating: { type: "array", description: "Rating values.", items: { type: "number", description: "Rating value." }, minItems: 1, maxItems: 20 },
    timestamp: { type: "array", description: "Unix timestamps.", items: { type: "integer", description: "Unix timestamp." }, minItems: 1, maxItems: 20 },
    channel: strings("Channel IDs."),
    link: jsonObjects("Link cell objects."),
    reference: jsonObjects("Reference cell objects."),
  },
  required: ["column_id"],
  additionalProperties: false,
};
const streamChunks = jsonObjects("Streaming chunks: markdown_text, task_update, plan_update, or blocks objects.", 1, 50);
const oneId = (description: string): JsonSchema => ({
  type: "array",
  description,
  items: { type: "string", minLength: 1 },
  minItems: 1,
  maxItems: 1,
});
const assistantPrompts: JsonSchema = {
  type: "array",
  description: "Suggested prompts. Each prompt needs title and message. At most four.",
  minItems: 1,
  maxItems: 4,
  items: {
    type: "object",
    description: "A suggested prompt.",
    properties: {
      title: str("Short prompt title."),
      message: str("Prompt message sent when the user selects this suggestion."),
    },
    required: ["title", "message"],
    additionalProperties: false,
  },
};
const agentCommands: JsonSchema = {
  type: "array",
  description: "Full command set for the calling agent in this code channel. Empty clears the agent's commands. At most 10 across all agents.",
  minItems: 0,
  maxItems: 10,
  items: {
    type: "object",
    description: "An agent slash command.",
    properties: {
      name: str("Command name without a leading slash."),
      description: str("Short description shown in the command palette."),
      argument_hint: str("Optional argument hint shown after the command name."),
    },
    required: ["name", "description"],
    additionalProperties: false,
  },
};
const sessionStatus = str("Agent session lifecycle status.", { enum: ["active", "processing", "suspended", "closed"] });
const triggerIds = (description: string, minItems: number): JsonSchema => ({
  ...strings(description, minItems),
  maxItems: 15,
});
const namedEntities = {
  userIds: strings("Encoded user IDs to grant or revoke."),
  channelIds: strings("Encoded channel IDs to grant or revoke."),
  teamIds: strings("Encoded workspace IDs to grant or revoke."),
  orgIds: strings("Encoded organization IDs to grant or revoke."),
};
const uploadFiles: JsonSchema = {
  type: "array",
  description: "File IDs returned by files.getUploadURLExternal, with optional titles.",
  minItems: 1,
  maxItems: 100,
  items: {
    type: "object",
    description: "A file to complete after the binary PUT.",
    properties: {
      id: str("File ID returned by files.getUploadURLExternal."),
      title: str("Optional title for the completed file."),
      highlight_type: str("Optional syntax or file highlight type."),
    },
    required: ["id"],
    additionalProperties: false,
  },
};
const sharedInviteMessage: JsonSchema = {
  type: "object",
  description: "Text to send with the approved Slack Connect invite. Both text and is_override are required when this object is set.",
  properties: {
    text: str("Invite message text. Combined length cannot exceed 560 characters.", { maxLength: 560 }),
    is_override: bool("When true, replace the original invite message; when false, append."),
  },
  required: ["text", "is_override"],
  additionalProperties: false,
};
const operation = (
  method: string,
  title: string,
  description: string,
  properties: Record<string, JsonSchema> = {},
  required: string[] = [],
  options: Pick<SlackOperation, "requiredAny" | "requiredGroups" | "exclusive" | "csvFields"> = {},
): SlackOperation => ({ method, title, description, properties, required, ...options });

/** Each entry names a real Slack Web API method and defines its public validator. */
export const SLACK_EXPANDED_OPERATIONS: Record<string, SlackOperation> = {
  "conversations.open": operation("conversations.open", "Open Direct Message", "Open or resume a direct or multi-person Slack conversation.", {
    users: str("Comma-separated Slack user IDs for the direct message.", { maxLength: 400 }),
    channel: str("Existing direct or multi-person conversation ID to resume."),
    returnIm: bool("Return the full direct-message conversation object."),
    preventCreation: bool("Return an existing conversation only; do not create one."),
  }, [], { requiredAny: ["users", "channel"], exclusive: ["users", "channel"] }),
  "conversations.close": operation("conversations.close", "Close Direct Message", "Close a direct or multi-person Slack conversation for the authenticated user.", {
    channel: str("Direct or multi-person conversation ID."),
  }, ["channel"]),
  "conversations.mark": operation("conversations.mark", "Mark Conversation Read", "Set the read cursor for a Slack conversation.", {
    channel: str("Conversation ID whose read cursor should be updated."),
    ts: str("Message timestamp to use as the new read cursor."),
  }, ["channel", "ts"]),
  "conversations.setPurpose": operation("conversations.setPurpose", "Set Conversation Purpose", "Set the purpose text for a Slack conversation.", {
    channel: str("Conversation ID to update."),
    purpose: str("New purpose text for the conversation.", { maxLength: 250 }),
  }, ["channel", "purpose"]),
  "chat.deleteScheduledMessage": operation("chat.deleteScheduledMessage", "Delete Scheduled Message", "Cancel a scheduled Slack message before it is delivered.", {
    channel: str("Conversation ID containing the scheduled message."),
    scheduledMessageId: str("Scheduled message ID returned by chat.scheduleMessage."),
  }, ["channel", "scheduledMessageId"]),
  "chat.scheduledMessages.list": operation("chat.scheduledMessages.list", "List Scheduled Messages", "List scheduled Slack messages, optionally filtered by conversation and time range.", {
    channel: str("Conversation ID to filter by."),
    cursor: str("Pagination cursor from a previous response."),
    limit: int("Maximum scheduled messages to return.", 1, 1000),
    oldest: str("Lower Unix timestamp bound."),
    latest: str("Upper Unix timestamp bound."),
  }),
  "reminders.list": operation("reminders.list", "List Reminders", "List reminders created by or for the authenticated Slack user.", {
    teamId: str("Workspace ID when using an organization token."),
  }),
  "reminders.add": operation("reminders.add", "Create Reminder", "Create a Slack reminder for a user or the authenticated user.", {
    text: str("Reminder text.", { maxLength: 500 }),
    time: str("Unix timestamp or supported natural-language reminder time."),
    user: str("User ID to remind; defaults to the authenticated user."),
    recurrence: {
      type: "object",
      description: "Optional repeating behavior for the reminder.",
      properties: {
        frequency: str("How often the reminder repeats.", { enum: ["daily", "weekly", "monthly", "yearly"] }),
        weekdays: {
          type: "array",
          description: "Days of the week for a weekly reminder.",
          items: str("Weekday for the reminder recurrence.", { enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] }),
          minItems: 1,
          maxItems: 7,
        },
      },
      required: ["frequency"],
      additionalProperties: false,
      minProperties: 1,
      maxProperties: 2,
      anyOf: [
        {
          properties: { frequency: str("How often the reminder repeats.", { enum: ["daily", "monthly", "yearly"] }) },
          additionalProperties: false,
        },
        {
          properties: { frequency: str("How often the reminder repeats.", { enum: ["weekly"] }) },
        },
      ],
    },
    teamId: str("Workspace ID when using an organization token."),
  }, ["text", "time"]),
  "reminders.info": operation("reminders.info", "Get Reminder", "Retrieve details for a Slack reminder ID.", {
    reminder: str("Reminder ID."),
    teamId: str("Workspace ID when using an organization token."),
  }, ["reminder"]),
  "reminders.delete": operation("reminders.delete", "Delete Reminder", "Delete a Slack reminder by ID.", {
    reminder: str("Reminder ID to delete."),
    teamId: str("Workspace ID when using an organization token."),
  }, ["reminder"]),
  "reminders.complete": operation("reminders.complete", "Complete Reminder", "Mark a Slack reminder as complete.", {
    reminder: str("Reminder ID to complete."),
    teamId: str("Workspace ID when using an organization token."),
  }, ["reminder"]),
  "usergroups.list": operation("usergroups.list", "List User Groups", "List workspace user groups and optionally include members or counts.", {
    includeCount: bool("Include each user group's member count."),
    includeDisabled: bool("Include disabled user groups."),
    includeUsers: bool("Include member IDs for each user group."),
    teamId: str("Workspace ID when using an organization token."),
  }),
  "usergroups.create": operation("usergroups.create", "Create User Group", "Create a Slack user group.", {
    name: str("Display name for the user group.", { maxLength: 80 }),
    handle: str("Unique mention handle for the user group.", { maxLength: 21 }),
    description: str("Description shown for the user group.", { maxLength: 250 }),
    channels: strings("Channel IDs to associate with this group.", 0),
    teamId: str("Workspace ID when using an organization token."),
    includeCount: bool("Include the member count in the response."),
  }, ["name"], { csvFields: ["channels"] }),
  "usergroups.update": operation("usergroups.update", "Update User Group", "Update the name, handle, description, or channels for a Slack user group.", {
    usergroup: str("User group ID to update."),
    name: str("New display name."),
    handle: str("New mention handle."),
    description: str("New description."),
    channels: strings("Replacement set of associated channel IDs.", 0),
    teamId: str("Workspace ID when using an organization token."),
    includeCount: bool("Include the member count in the response."),
  }, ["usergroup"], { csvFields: ["channels"] }),
  "usergroups.users.list": operation("usergroups.users.list", "List User Group Members", "List user IDs in a Slack user group.", {
    usergroup: str("User group ID."),
    includeDisabled: bool("Include disabled members."),
    teamId: str("Workspace ID when using an organization token."),
  }, ["usergroup"]),
  "usergroups.users.update": operation("usergroups.users.update", "Replace User Group Members", "Replace the complete member list for a Slack user group.", {
    usergroup: str("User group ID to update."),
    users: strings("Complete replacement set of Slack user IDs."),
    includeCount: bool("Include the updated member count."),
    teamId: str("Workspace ID when using an organization token."),
  }, ["usergroup", "users"]),
  "usergroups.disable": operation("usergroups.disable", "Disable User Group", "Disable a Slack user group while preserving it for later reactivation.", {
    usergroup: str("User group ID to disable."),
    teamId: str("Workspace ID when using an organization token."),
  }, ["usergroup"]),
  "usergroups.enable": operation("usergroups.enable", "Enable User Group", "Reactivate a disabled Slack user group.", {
    usergroup: str("User group ID to enable."),
    teamId: str("Workspace ID when using an organization token."),
  }, ["usergroup"]),
  "users.profile.get": operation("users.profile.get", "Get User Profile", "Retrieve a Slack user's profile and custom status.", {
    user: str("User ID; defaults to the authenticated user."),
  }),
  "dnd.info": operation("dnd.info", "Get Do Not Disturb Status", "Retrieve the Do Not Disturb schedule for a Slack user.", {
    user: str("User ID; defaults to the authenticated user."),
    teamId: str("Workspace ID when using an organization token."),
  }),
  "dnd.teamInfo": operation("dnd.teamInfo", "Get Team Do Not Disturb Status", "Retrieve Do Not Disturb status for selected workspace users.", {
    users: { ...strings("User IDs to inspect.", 1), maxItems: 50 },
    teamId: str("Workspace ID when using an organization token."),
  }, ["users"], { csvFields: ["users"] }),
  "files.list": operation("files.list", "List Files", "List Slack files visible to the authenticated user with optional filters.", {
    channel: str("Conversation ID to filter files by."),
    user: str("User ID whose files should be listed."),
    tsFrom: str("Return files created on or after this Unix timestamp."),
    tsTo: str("Return files created on or before this Unix timestamp."),
    types: str("Comma-separated Slack file types, such as pdf, images, or snippets."),
    count: int("Number of files per page.", 1, 1000),
    page: int("One-based result page.", 1),
  }),
  "files.remote.add": operation("files.remote.add", "Add Remote File", "Register a remote document in Slack without uploading its content.", {
    externalId: str("Stable ID assigned by the document's external system."),
    externalUrl: str("HTTPS URL for the remote document.", { format: "uri" }),
    title: str("Title displayed for the remote file.", { maxLength: 200 }),
    filetype: str("Optional Slack file type, such as doc or pdf."),
  }, ["externalId", "externalUrl", "title"]),
  "files.remote.info": operation("files.remote.info", "Get Remote File", "Retrieve a remote Slack file by Slack file ID or external ID.", {
    file: str("Slack remote file ID."),
    externalId: str("External file ID assigned by the source system."),
  }, [], { requiredAny: ["file", "externalId"], exclusive: ["file", "externalId"] }),
  "files.remote.list": operation("files.remote.list", "List Remote Files", "List remote files added to Slack with optional channel, time, and cursor filters.", {
    channel: str("Conversation ID to filter by."),
    cursor: str("Pagination cursor from a previous response."),
    limit: int("Maximum remote files to return.", 1, 1000),
    tsFrom: str("Return files created on or after this Unix timestamp."),
    tsTo: str("Return files created on or before this Unix timestamp."),
  }),
  "files.remote.remove": operation("files.remote.remove", "Remove Remote File", "Remove a remote file record from Slack without deleting the source document.", {
    file: str("Slack remote file ID."),
    externalId: str("External file ID assigned by the source system."),
  }, [], { requiredAny: ["file", "externalId"], exclusive: ["file", "externalId"] }),
  "files.remote.share": operation("files.remote.share", "Share Remote File", "Share a registered remote file into one or more Slack conversations.", {
    file: str("Slack remote file ID."),
    externalId: str("External file ID assigned by the source system."),
    channels: strings("Conversation IDs where the file should be shared."),
  }, ["channels"], { requiredAny: ["file", "externalId"], exclusive: ["file", "externalId"], csvFields: ["channels"] }),
  "files.remote.update": operation("files.remote.update", "Update Remote File", "Update the title, URL, or type for a registered remote file.", {
    file: str("Slack remote file ID."),
    externalId: str("External file ID assigned by the source system."),
    externalUrl: str("Updated HTTPS URL for the remote document.", { format: "uri" }),
    title: str("Updated title displayed in Slack.", { maxLength: 200 }),
    filetype: str("Updated Slack file type."),
  }, [], {
    requiredAny: ["file", "externalId"],
    requiredGroups: [["externalUrl", "title", "filetype"]],
    exclusive: ["file", "externalId"],
  }),
  "files.revokePublicURL": operation("files.revokePublicURL", "Revoke File Public Link", "Revoke the public permalink for a Slack file.", {
    file: str("Slack file ID whose public link should be revoked."),
  }, ["file"]),
  "users.getPresence": operation("users.getPresence", "Get User Presence", "Retrieve a Slack user's online presence.", {
    user: str("User ID whose presence should be retrieved."),
  }, ["user"]),
  "users.setPresence": operation("users.setPresence", "Set User Presence", "Set the authenticated Slack user's presence to auto or away.", {
    presence: str("Presence to set.", { enum: ["auto", "away"] }),
  }, ["presence"]),
  "api.test": operation("api.test", "Test Slack API", "Echo arguments through Slack's api.test method to verify connectivity.", {
    foo: str("Optional value Slack should echo back."),
    error: str("Optional error code Slack should return for error-handling tests."),
  }),
  "chat.getPermalink": operation("chat.getPermalink", "Get Message Permalink", "Retrieve a permalink URL for an existing Slack message.", {
    channel: str("Conversation ID containing the message."),
    messageTs: str("Message timestamp (ts) uniquely identifying the message."),
  }, ["channel", "messageTs"]),
  "chat.unfurl": operation("chat.unfurl", "Customize URL Unfurl", "Attach custom unfurl previews to URLs in a Slack message. Provide channel+ts or unfurlId+source, plus unfurls or metadata.", {
    channel: str("Conversation ID containing the message to unfurl."),
    ts: str("Timestamp of the message containing the URL."),
    unfurlId: str("Link ID to unfurl, used with source instead of channel+ts."),
    source: str("Where the link appeared.", { enum: ["composer", "conversations_history"] }),
    unfurls: jsonObject("Map of URLs to Slack unfurl attachments or blocks."),
    metadata: jsonObject("Work Object metadata used instead of or with unfurls."),
    userAuthRequired: bool("Require the posting user to authenticate with the app before unfurling."),
    userAuthUrl: str("HTTPS URL where the user completes unfurl authentication.", { format: "uri" }),
    userAuthMessage: str("Ephemeral authentication prompt text."),
    userAuthBlocks: jsonObjects("Block Kit blocks for the authentication prompt."),
  }, [], {
    requiredAny: ["channel", "unfurlId"],
    requiredGroups: [["unfurls", "metadata"]],
    exclusive: ["channel", "unfurlId"],
  }),
  "reactions.list": operation("reactions.list", "List User Reactions", "List items a Slack user has reacted to, with cursor or page pagination.", {
    user: str("User ID whose reactions should be listed; defaults to the authenticated identity."),
    full: bool("Return the complete reaction list, including deleted items."),
    count: int("Number of items per page.", 1, 1000),
    page: int("One-based result page.", 1),
    cursor: str("Pagination cursor from a previous response."),
    limit: int("Maximum items to return with cursor pagination.", 1, 1000),
    teamId: str("Workspace ID when using an organization token."),
  }),
  "files.delete": operation("files.delete", "Delete File", "Permanently delete a Slack file by ID.", {
    file: str("Slack file ID to delete."),
  }, ["file"]),
  "files.comments.delete": operation("files.comments.delete", "Delete File Comment", "Delete a comment from a Slack file.", {
    file: str("Slack file ID that owns the comment."),
    id: str("File comment ID to delete."),
  }, ["file", "id"]),
  "bots.info": operation("bots.info", "Get Bot User", "Retrieve information about a Slack bot user by bot ID.", {
    bot: str("Bot ID, typically starting with B."),
    teamId: str("Workspace ID when using an organization token."),
  }),
  "team.profile.get": operation("team.profile.get", "Get Team Profile", "Retrieve workspace profile field definitions, optionally filtered by visibility.", {
    visibility: str("Which profile fields to return.", { enum: ["all", "visible", "hidden"] }),
    teamId: str("Workspace ID when using an organization token."),
  }),
  "users.conversations": operation("users.conversations", "List User Conversations", "List conversations a user or the authenticated bot belongs to.", {
    user: str("User ID whose membership should be listed; defaults to the authenticated identity."),
    types: {
      type: "array",
      description: "Conversation types to include.",
      items: str("Conversation type.", { enum: ["public_channel", "private_channel", "mpim", "im"] }),
      minItems: 1,
      maxItems: 4,
    },
    excludeArchived: bool("Exclude archived conversations."),
    excludeMuted: bool("Exclude muted conversations."),
    cursor: str("Pagination cursor from a previous response."),
    limit: int("Maximum conversations to return.", 1, 999),
    teamId: str("Workspace ID when using an organization token."),
  }, [], { csvFields: ["types"] }),
  "calls.add": operation("calls.add", "Start Call", "Register a third-party call in Slack. createdBy is required when authenticating with a bot token.", {
    externalUniqueId: str("Unique ID assigned by the call provider."),
    joinUrl: str("HTTPS URL clients use to join the call.", { format: "uri" }),
    createdBy: str("Slack user ID of the call creator; required for bot tokens."),
    title: str("Display title for the call.", { maxLength: 200 }),
    dateStart: int("Unix start time of the call.", 0),
    externalDisplayId: str("Human-readable call ID shown in Slack."),
    desktopAppJoinUrl: str("Optional deep-link URL that launches the native call app."),
    users: callUsers,
  }, ["externalUniqueId", "joinUrl", "createdBy"]),
  "calls.end": operation("calls.end", "End Call", "Mark a registered Slack call as ended.", {
    id: str("Call ID returned by calls.add."),
    duration: int("Call duration in seconds.", 0),
  }, ["id"]),
  "calls.info": operation("calls.info", "Get Call Info", "Retrieve a point-in-time snapshot of a registered Slack call.", {
    id: str("Call ID returned by calls.add."),
  }, ["id"]),
  "calls.update": operation("calls.update", "Update Call Info", "Update the title or join URLs for a registered Slack call.", {
    id: str("Call ID returned by calls.add."),
    title: str("Updated display title."),
    joinUrl: str("Updated HTTPS join URL.", { format: "uri" }),
    desktopAppJoinUrl: str("Updated native-app join URL."),
  }, ["id"], { requiredGroups: [["title", "joinUrl", "desktopAppJoinUrl"]] }),
  "calls.participants.add": operation("calls.participants.add", "Add Call Participants", "Register additional participants on a Slack call.", {
    id: str("Call ID returned by calls.add."),
    users: callUsers,
  }, ["id", "users"]),
  "calls.participants.remove": operation("calls.participants.remove", "Remove Call Participants", "Remove participants from a Slack call.", {
    id: str("Call ID returned by calls.add."),
    users: callUsers,
  }, ["id", "users"]),
  "canvases.create": operation("canvases.create", "Create Canvas", "Create a standalone Slack canvas, optionally tabbed into a channel.", {
    title: str("Title of the new canvas.", { maxLength: 200 }),
    channelId: str("Channel ID to add the canvas to as a tab."),
    documentContent: canvasContent,
  }),
  "canvases.edit": operation("canvases.edit", "Edit Canvas", "Apply a single insert, replace, delete, or rename operation to a Slack canvas.", {
    canvasId: str("Encoded canvas ID."),
    changes: {
      type: "array",
      description: "Exactly one canvas edit operation.",
      minItems: 1,
      maxItems: 1,
      items: {
        type: "object",
        description: "A canvas edit operation.",
        properties: {
          operation: str("Edit operation to apply.", { enum: ["insert_after", "insert_before", "insert_at_start", "insert_at_end", "replace", "delete", "rename"] }),
          section_id: str("Section ID for relative insert, replace, or delete operations."),
          document_content: canvasContent,
          title_content: canvasContent,
        },
        required: ["operation"],
        additionalProperties: false,
      },
    },
  }, ["canvasId", "changes"]),
  "canvases.delete": operation("canvases.delete", "Delete Canvas", "Permanently delete a Slack canvas.", {
    canvasId: str("Encoded canvas ID to delete."),
  }, ["canvasId"]),
  "canvases.sections.lookup": operation("canvases.sections.lookup", "Lookup Canvas Sections", "Find section IDs in a Slack canvas for targeted edits.", {
    canvasId: str("Encoded canvas ID to search."),
    criteria: {
      type: "object",
      description: "Section filter. Provide section_types and/or contains_text.",
      properties: {
        section_types: {
          type: "array",
          description: "Section types to match.",
          items: str("Canvas section type.", {
            enum: ["any_header", "blockquote", "callout", "canvas_unfurl", "chart", "citation", "file_unfurl", "flexbox", "h1", "h2", "h3", "horizontal_line", "list", "message_unfurl", "sfdc_record_mention", "sfdc_record_unfurl", "table", "user_mention", "user_unfurl"],
          }),
          minItems: 1,
          maxItems: 20,
        },
        contains_text: str("Text that matching sections must contain."),
      },
      additionalProperties: false,
      minProperties: 1,
    },
  }, ["canvasId", "criteria"]),
  "slackLists.create": operation("slackLists.create", "Create Slack List", "Create a Slack List with an optional schema, description, or copied structure.", {
    name: str("Title of the new List.", { maxLength: 200 }),
    todoMode: bool("Create the List in to-do/task-tracking mode."),
    copyFromListId: str("Existing List ID whose columns should be copied."),
    includeCopiedListRecords: bool("Also copy rows when copyFromListId is set."),
    descriptionBlocks: jsonObjects("Block Kit rich_text description for the List.", 1, 20),
    schema: jsonObjects("Column definitions for the List.", 1, 50),
  }, ["name"]),
  "slackLists.update": operation("slackLists.update", "Update Slack List", "Update a Slack List's name, description, or to-do mode.", {
    id: str("List ID to update."),
    name: str("New List title.", { maxLength: 200 }),
    todoMode: bool("Whether the List should use to-do/task-tracking mode."),
    descriptionBlocks: jsonObjects("Replacement Block Kit description.", 1, 20),
  }, ["id"], { requiredGroups: [["name", "todoMode", "descriptionBlocks"]] }),
  "slackLists.items.create": operation("slackLists.items.create", "Create Slack List Item", "Add a row to a Slack List, optionally duplicating an existing row or nesting a subtask.", {
    listId: str("List ID that will own the new row."),
    duplicatedItemId: str("Existing row ID to duplicate."),
    parentItemId: str("Parent row ID when creating a subtask."),
    initialFields: { ...jsonObjects("Initial cell values for the new row."), items: listField },
  }, ["listId"]),
  "slackLists.items.update": operation("slackLists.items.update", "Update Slack List Item", "Update cells on existing Slack List rows. Each cell must identify an existing row_id.", {
    listId: str("List ID containing the rows to update."),
    cells: {
      type: "array",
      description: "Cells to write. Each cell needs row_id, column_id, and a typed value.",
      minItems: 1,
      maxItems: 100,
      items: { ...listField, required: ["column_id", "row_id"] },
    },
  }, ["listId", "cells"]),
  "slackLists.items.delete": operation("slackLists.items.delete", "Delete Slack List Item", "Permanently delete a row from a Slack List.", {
    listId: str("List ID that owns the row."),
    id: str("Row ID to delete, for example Rec0123456789."),
  }, ["listId", "id"]),
  "slackLists.items.deleteMultiple": operation("slackLists.items.deleteMultiple", "Delete Slack List Items", "Permanently delete multiple Slack List rows in one all-or-nothing request.", {
    listId: str("List ID that owns the rows."),
    ids: strings("Row IDs to delete.", 1),
  }, ["listId", "ids"]),
  "slackLists.items.list": operation("slackLists.items.list", "List Slack List Items", "List rows in a Slack List with optional archived filter and cursor pagination.", {
    listId: str("List ID whose rows should be listed."),
    archived: bool("When true, return archived rows instead of active rows."),
    cursor: str("Pagination cursor from a previous response."),
    limit: int("Maximum rows to return.", 1, 1000),
  }, ["listId"]),
  "slackLists.items.info": operation("slackLists.items.info", "Get Slack List Item", "Retrieve a single Slack List row by List ID and row ID.", {
    listId: str("List ID that owns the row."),
    id: str("Row ID to retrieve."),
    includeIsSubscribed: bool("Include whether the caller is subscribed to the row."),
  }, ["listId", "id"]),
  "slackLists.access.set": operation("slackLists.access.set", "Set Slack List Access", "Grant read, write, or owner access on a Slack List to users or channels. Provide exactly one of channelIds or userIds.", {
    listId: str("List ID to share."),
    accessLevel: str("Access level to grant.", { enum: ["read", "write", "owner"] }),
    channelIds: strings("Channel IDs to grant access to."),
    userIds: strings("User IDs to grant access to."),
  }, ["listId", "accessLevel"], { requiredAny: ["channelIds", "userIds"], exclusive: ["channelIds", "userIds"] }),
  "slackLists.access.delete": operation("slackLists.access.delete", "Delete Slack List Access", "Revoke sharing access on a Slack List for users or channels. Provide exactly one of channelIds or userIds.", {
    listId: str("List ID to update."),
    channelIds: strings("Channel IDs to revoke access from."),
    userIds: strings("User IDs to revoke access from."),
  }, ["listId"], { requiredAny: ["channelIds", "userIds"], exclusive: ["channelIds", "userIds"] }),
  "bookmarks.add": operation("bookmarks.add", "Add Bookmark", "Add a link bookmark to a Slack conversation. Slack currently accepts type=link.", {
    channelId: str("Conversation ID that will own the bookmark."),
    title: str("Bookmark title.", { maxLength: 200 }),
    type: str("Bookmark type. Slack currently accepts link.", { enum: ["link"] }),
    link: str("HTTP or HTTPS URL to bookmark."),
    emoji: str("Emoji name to show beside the bookmark, for example :link:."),
    entityId: str("Message or file ID when bookmarking an internal Slack entity."),
    accessLevel: str("File permission to apply when bookmarking a file.", { enum: ["read", "write"] }),
    parentId: str("Parent bookmark ID when nesting this bookmark."),
  }, ["channelId", "title", "type", "link"]),
  "bookmarks.edit": operation("bookmarks.edit", "Edit Bookmark", "Update the title, link, or emoji of an existing Slack bookmark. Provide at least one field to change.", {
    channelId: str("Conversation ID that owns the bookmark."),
    bookmarkId: str("Bookmark ID to update."),
    title: str("Replacement bookmark title.", { maxLength: 200 }),
    link: str("Replacement HTTP or HTTPS URL."),
    emoji: str("Replacement emoji name."),
  }, ["channelId", "bookmarkId"], { requiredGroups: [["title", "link", "emoji"]] }),
  "bookmarks.list": operation("bookmarks.list", "List Bookmarks", "List bookmarks in a Slack conversation.", {
    channelId: str("Conversation ID whose bookmarks should be listed."),
  }, ["channelId"]),
  "bookmarks.remove": operation("bookmarks.remove", "Remove Bookmark", "Remove a bookmark from a Slack conversation.", {
    channelId: str("Conversation ID that owns the bookmark."),
    bookmarkId: str("Bookmark ID to remove."),
  }, ["channelId", "bookmarkId"]),
  "canvases.getContent": operation("canvases.getContent", "Get Canvas Content", "Read a Slack canvas as markdown or HTML.", {
    canvasId: str("Encoded canvas ID."),
    contentType: str("Response format.", { enum: ["markdown", "html"] }),
  }, ["canvasId"]),
  "canvases.access.set": operation("canvases.access.set", "Set Canvas Access", "Grant read, write, or owner access on a Slack canvas. Provide exactly one of channelIds or userIds.", {
    canvasId: str("Encoded canvas ID to share."),
    accessLevel: str("Access level to grant.", { enum: ["read", "write", "owner"] }),
    channelIds: { ...strings("Channel IDs to grant access to."), maxItems: 20 },
    userIds: { ...strings("User IDs to grant access to."), maxItems: 20 },
  }, ["canvasId", "accessLevel"], { requiredAny: ["channelIds", "userIds"], exclusive: ["channelIds", "userIds"] }),
  "canvases.access.delete": operation("canvases.access.delete", "Delete Canvas Access", "Revoke canvas access for one channel or one user. Provide exactly one of channelIds or userIds.", {
    canvasId: str("Encoded canvas ID to update."),
    channelIds: oneId("Channel ID to revoke access from. Slack accepts at most one."),
    userIds: oneId("User ID to revoke access from. Slack accepts at most one."),
  }, ["canvasId"], { requiredAny: ["channelIds", "userIds"], exclusive: ["channelIds", "userIds"] }),
  "chat.startStream": operation("chat.startStream", "Start Streaming Message", "Start a bot streaming message. Provide markdownText or chunks, not both.", {
    channel: str("Conversation ID to stream into."),
    chunks: streamChunks,
    markdownText: str("Markdown text to start the stream with.", { maxLength: 12000 }),
    threadTs: str("Parent message timestamp when streaming a thread reply."),
    recipientUserId: str("User ID that should receive the stream. Required when streaming to a channel."),
    recipientTeamId: str("Team ID of the receiving user. Required when streaming to a channel."),
    taskDisplayMode: str("How task updates render.", { enum: ["timeline", "plan"] }),
    iconEmoji: str("Emoji to use as the bot icon, for example :robot_face:."),
    iconUrl: str("HTTPS URL for the bot icon.", { format: "uri" }),
    username: str("Bot username to display."),
  }, ["channel"], { exclusive: ["markdownText", "chunks"] }),
  "chat.appendStream": operation("chat.appendStream", "Append Streaming Message", "Append markdown or chunks to an in-progress Slack streaming message. Provide exactly one of markdownText or chunks.", {
    channel: str("Conversation ID containing the streaming message."),
    ts: str("Timestamp of the streaming message returned by chat.startStream."),
    chunks: streamChunks,
    markdownText: str("Markdown text to append.", { maxLength: 12000 }),
  }, ["channel", "ts"], { requiredAny: ["markdownText", "chunks"], exclusive: ["markdownText", "chunks"] }),
  "chat.stopStream": operation("chat.stopStream", "Stop Streaming Message", "Finalize a Slack streaming message. Provide markdownText or chunks, not both.", {
    channel: str("Conversation ID containing the streaming message."),
    ts: str("Timestamp of the streaming message."),
    chunks: streamChunks,
    markdownText: str("Final markdown text to append before stopping.", { maxLength: 12000 }),
    blocks: jsonObjects("Block Kit blocks rendered at the bottom of the finalized message.", 1, 50),
    metadata: jsonObject("Message metadata with event_type and event_payload."),
    sessionStatus: str("Agent session status after the stream stops.", { enum: ["active", "processing", "suspended", "closed"] }),
  }, ["channel", "ts"], { exclusive: ["markdownText", "chunks"] }),
  "conversations.inviteShared": operation("conversations.inviteShared", "Invite To Slack Connect Channel", "Invite one external email or one known user ID into a Slack Connect channel.", {
    channel: str("Channel ID on the calling team to share."),
    emails: oneId("One email address to invite. Slack accepts a single recipient."),
    userIds: oneId("One Slack user ID to invite. Slack accepts a single recipient."),
    externalLimited: bool("When true, the invitee can post only. Defaults to true on Slack."),
  }, ["channel"], { requiredAny: ["emails", "userIds"], exclusive: ["emails", "userIds"] }),
  "conversations.acceptSharedInvite": operation("conversations.acceptSharedInvite", "Accept Slack Connect Invite", "Accept a Slack Connect channel invitation. Provide inviteId or channelId.", {
    channelName: str("Name the channel should take in this workspace."),
    isPrivate: bool("Create the accepted channel as private."),
    freeTrialAccepted: bool("Start a Slack Connect free trial when the workspace qualifies."),
    inviteId: str("Invitation ID to accept."),
    channelId: str("Existing shared channel ID to accept instead of inviteId."),
    teamId: str("Workspace ID that should accept the channel. Required for org tokens."),
  }, ["channelName"], { requiredAny: ["inviteId", "channelId"], exclusive: ["inviteId", "channelId"] }),
  "conversations.approveSharedInvite": operation("conversations.approveSharedInvite", "Approve Slack Connect Invite", "Approve a pending Slack Connect channel invitation.", {
    inviteId: str("Invitation ID to approve."),
    targetTeam: str("Encoded team ID of the inviting workspace."),
  }, ["inviteId"]),
  "conversations.declineSharedInvite": operation("conversations.declineSharedInvite", "Decline Slack Connect Invite", "Decline a pending Slack Connect channel invitation.", {
    inviteId: str("Invitation ID to decline."),
    targetTeam: str("Encoded team ID of the inviting workspace."),
  }, ["inviteId"]),
  "conversations.listConnectInvites": operation("conversations.listConnectInvites", "List Slack Connect Invites", "List pending Slack Connect invitations sent from this workspace.", {
    teamId: str("Workspace ID when using an organization token."),
    count: int("Maximum invitations to return.", 1, 1000),
    cursor: str("Pagination cursor from a previous response."),
  }),
  "conversations.externalInvitePermissions.set": operation("conversations.externalInvitePermissions.set", "Set Slack Connect Permissions", "Upgrade or downgrade an external team's Slack Connect channel permissions.", {
    channel: str("Shared channel ID."),
    targetTeam: str("Encoded team ID of the external team already in the channel."),
    action: str("Permission change to apply.", { enum: ["upgrade", "downgrade"] }),
  }, ["channel", "targetTeam", "action"]),
  "conversations.requestSharedInvite.approve": operation("conversations.requestSharedInvite.approve", "Approve Shared Invite Request", "Approve a request to add an external user and send them a Slack Connect invite.", {
    inviteId: str("Requested invite ID to approve."),
    isExternalLimited: bool("Override whether the invited team has post-only permissions."),
    channelId: str("Override channel ID that will receive the invite."),
    message: sharedInviteMessage,
  }, ["inviteId"]),
  "conversations.requestSharedInvite.deny": operation("conversations.requestSharedInvite.deny", "Deny Shared Invite Request", "Deny a request to add an external user to a Slack Connect channel.", {
    inviteId: str("Requested invite ID to deny."),
    message: str("Optional explanation sent with the denial.", { maxLength: 560 }),
  }, ["inviteId"]),
  "conversations.requestSharedInvite.list": operation("conversations.requestSharedInvite.list", "List Shared Invite Requests", "List Slack Connect invite requests, optionally filtered by user, status, or invite IDs.", {
    userId: str("User ID whose requests should be listed."),
    includeExpired: bool("Include expired requests."),
    includeApproved: bool("Include already approved requests."),
    includeDenied: bool("Include already denied requests."),
    inviteIds: { ...strings("Invite IDs to look up.", 1), maxItems: 1000 },
    limit: int("Maximum requests to return.", 1, 1000),
    cursor: str("Pagination cursor from a previous response."),
  }, [], { csvFields: ["inviteIds"] }),
  "conversations.canvases.create": operation("conversations.canvases.create", "Create Channel Canvas", "Create the channel canvas tab for a Slack conversation.", {
    channelId: str("Channel ID that will own the canvas tab."),
    documentContent: canvasContent,
    title: str("Title of the new channel canvas.", { maxLength: 200 }),
  }, ["channelId"]),
  "blocks.validate": operation("blocks.validate", "Validate Block Kit", "Validate Block Kit JSON. Provide exactly one of blocks, view, or message.", {
    blocks: jsonObjects("Standalone Block Kit blocks array."),
    view: jsonObject("A modal, home, or workflow view payload."),
    message: jsonObject("A message payload containing blocks."),
  }, [], { requiredAny: ["blocks", "view", "message"], exclusive: ["blocks", "view", "message"] }),
  "views.open": operation("views.open", "Open View", "Open a modal by exchanging a trigger ID or interactivity pointer.", {
    view: jsonObject("View payload to open."),
    triggerId: str("Interaction trigger ID to exchange."),
    interactivityPointer: str("Interactivity pointer to exchange instead of triggerId."),
  }, ["view"], { requiredAny: ["triggerId", "interactivityPointer"], exclusive: ["triggerId", "interactivityPointer"] }),
  "views.update": operation("views.update", "Update View", "Replace an open view by view ID or external ID.", {
    view: jsonObject("Replacement view payload."),
    viewId: str("View ID returned by views.open."),
    externalId: str("Developer-assigned external view ID.", { maxLength: 255 }),
    hash: str("View hash used to avoid race conditions."),
  }, ["view"], { requiredAny: ["viewId", "externalId"], exclusive: ["viewId", "externalId"] }),
  "views.push": operation("views.push", "Push View", "Push a view onto an existing modal stack.", {
    view: jsonObject("View payload to push."),
    triggerId: str("Interaction trigger ID to exchange."),
    interactivityPointer: str("Interactivity pointer to exchange instead of triggerId."),
  }, ["view"], { requiredAny: ["triggerId", "interactivityPointer"], exclusive: ["triggerId", "interactivityPointer"] }),
  "views.publish": operation("views.publish", "Publish Home View", "Publish or update an app Home tab for a user.", {
    userId: str("User ID that should receive the Home tab."),
    view: jsonObject("Home view payload to publish."),
    hash: str("View hash used to avoid race conditions."),
    interactivityPointer: str("Optional interactivity pointer."),
  }, ["userId", "view"]),
  "files.getUploadURLExternal": operation("files.getUploadURLExternal", "Get File Upload URL", "Start Slack's three-step upload by requesting an upload URL and file ID. This call does not PUT file bytes.", {
    filename: str("Name of the file being uploaded."),
    length: int("Size of the file in bytes.", 1),
    snippetType: str("Syntax type when uploading a snippet, for example python."),
    altTxt: str("Image description for screen readers.", { maxLength: 1000 }),
  }, ["filename", "length"]),
  "files.completeUploadExternal": operation("files.completeUploadExternal", "Complete File Upload", "Finish a files.getUploadURLExternal upload after the binary PUT. This call is JSON orchestration, not the file-bytes upload.", {
    files: uploadFiles,
    channelId: str("Channel ID to share the file into. Omit to keep the file private."),
    threadTs: str("Parent message timestamp when sharing into a thread."),
    channels: strings("Additional channel or user IDs to share the file into."),
    initialComment: str("Message text introducing the file."),
    blocks: jsonObjects("Block Kit blocks for the share message. Ignored when initialComment is set."),
    username: str("Bot username for the share message. Requires chat:write.customize."),
    iconUrl: str("HTTPS icon URL for the share message.", { format: "uri" }),
    iconEmoji: str("Emoji icon for the share message."),
  }, ["files"], { csvFields: ["channels"] }),
  "slackLists.download.start": operation("slackLists.download.start", "Start Slack List Download", "Start a job that exports Slack List contents as CSV or JSON.", {
    listId: str("List ID to export."),
    includeArchived: bool("Include archived rows in the export."),
    format: str("Export format.", { enum: ["csv", "json"] }),
    includeThreads: bool("Include item conversation threads. JSON exports only."),
    includeAttachments: bool("Include attachment metadata. JSON exports only."),
  }, ["listId"]),
  "slackLists.download.get": operation("slackLists.download.get", "Get Slack List Download", "Retrieve the download URL for a Slack List export job.", {
    listId: str("List ID that was exported."),
    jobId: str("Job ID returned by slackLists.download.start."),
    format: str("Export format. Must match the value passed to start.", { enum: ["csv", "json"] }),
    includeThreads: bool("Must match the value passed to start. JSON exports only."),
    includeAttachments: bool("Must match the value passed to start. JSON exports only."),
  }, ["listId", "jobId"]),
  "assistant.threads.setStatus": operation("assistant.threads.setStatus", "Set Assistant Thread Status", "Set the status shown in an AI assistant thread. Uses chat:write; Slack is dropping assistant:write for this method.", {
    channelId: str("Channel ID containing the assistant thread."),
    threadTs: str("Thread timestamp whose status should change."),
    status: str("Status text shown after the app name, for example is thinking..."),
    loadingMessages: { ...strings("Loading messages Slack rotates through.", 1), maxItems: 10 },
    iconEmoji: str("Emoji to use as the status icon."),
    iconUrl: str("HTTPS URL for the status icon.", { format: "uri" }),
    username: str("Bot username to display."),
  }, ["channelId", "threadTs", "status"]),
  "assistant.threads.setSuggestedPrompts": operation("assistant.threads.setSuggestedPrompts", "Set Assistant Suggested Prompts", "Set up to four suggested prompts on an assistant thread or agent Messages tab.", {
    channelId: str("Channel ID containing the assistant thread or agent DM."),
    prompts: assistantPrompts,
    threadTs: str("Thread timestamp for the legacy assistant experience. Omit for agent apps."),
    title: str("Heading shown above the prompt list."),
  }, ["channelId", "prompts"]),
  "assistant.threads.setTitle": operation("assistant.threads.setTitle", "Set Assistant Thread Title", "Set the title shown for an assistant thread in DM history.", {
    channelId: str("Channel ID containing the assistant thread."),
    threadTs: str("Thread timestamp to title."),
    title: str("Title to display for the thread."),
  }, ["channelId", "threadTs", "title"]),
  "auth.teams.list": operation("auth.teams.list", "List Auth Teams", "List workspaces the authenticated token can access. Slack documents form-urlencoded; this connector still POSTs JSON like the other methods.", {
    limit: int("Maximum workspaces to return.", 1, 1000),
    cursor: str("Pagination cursor from a previous response."),
    includeIcon: bool("Include workspace icon URLs."),
  }),
  "users.discoverableContacts.lookup": operation("users.discoverableContacts.lookup", "Lookup Discoverable Contact", "Check whether an email address is discoverable on Slack Connect. Returns is_discoverable only.", {
    email: str("Email address to look up."),
  }, ["email"]),
  "team.preferences.list": operation("team.preferences.list", "List Team Preferences", "Read a small set of workspace preferences such as file-upload and message-edit settings."),
  "team.billing.info": operation("team.billing.info", "Get Team Billing Plan", "Read the workspace billing plan: free, std, plus, enterprise, or compliance."),
  "agents.conversations.create": operation("agents.conversations.create", "Create Agent Code Channel", "Create a dedicated code channel for an agent session. Bot tokens only; name is required unless an origin message is also supplied.", {
    name: str("Display name for the code channel.", { maxLength: 80 }),
    teamId: str("Workspace ID to create the channel in. Required for org tokens when originChannelId is omitted."),
    sessionId: str("Opaque agent session ID. When set, the call is idempotent."),
    isPrivate: bool("Create a private channel instead of a public one."),
    originChannelId: str("Channel ID where the agent session started. Must be sent with originMessageTs."),
    originMessageTs: str("Origin message timestamp. Must be sent with originChannelId."),
  }, ["name"]),
  "agents.conversations.archive": operation("agents.conversations.archive", "Archive Agent Code Channel", "Archive a code channel when the agent session is complete.", {
    channelId: str("Code channel ID to archive."),
    summaryMessageTs: str("Timestamp of a summary message in the code channel to pin back on the origin thread."),
  }, ["channelId"]),
  "agents.conversations.getCanvas": operation("agents.conversations.getCanvas", "Get Agent Channel Canvas", "Read a canvas attached to a code channel as markdown, including comment threads.", {
    channel: str("Code channel ID that owns the canvas."),
    canvasId: str("Encoded canvas ID."),
    contentFormat: str("Canvas content format. Slack currently returns markdown.", { enum: ["markdown"] }),
    includeResolved: bool("Include resolved comment threads."),
  }, ["channel", "canvasId"]),
  "agents.conversations.listViews": operation("agents.conversations.listViews", "List Agent Channel Views", "List HTML, diff, Block Kit, and canvas views attached to a code channel.", {
    channelId: str("Code channel ID whose views should be listed."),
  }, ["channelId"]),
  "agents.conversations.removeView": operation("agents.conversations.removeView", "Remove Agent Channel View", "Remove a view tab from a code channel. Provide exactly one of viewKey or viewId.", {
    channelId: str("Code channel ID that owns the view."),
    viewKey: str("Agent-assigned view key."),
    viewId: str("Encoded channel tab ID of the view."),
  }, ["channelId"], { requiredAny: ["viewKey", "viewId"], exclusive: ["viewKey", "viewId"] }),
  "agents.conversations.setCanvasContent": operation("agents.conversations.setCanvasContent", "Set Agent Canvas Content", "Replace a code-channel canvas with markdown. Unchanged sections keep their comment anchors.", {
    channel: str("Code channel ID that owns the canvas."),
    canvasId: str("Encoded canvas ID."),
    content: str("Full canvas markdown. Slack diffs against the current document."),
  }, ["channel", "canvasId", "content"]),
  "agents.conversations.setCommands": operation("agents.conversations.setCommands", "Set Agent Slash Commands", "Replace the calling agent's slash-command set in a code channel. Pass an empty list to clear.", {
    channelId: str("Code channel ID to register commands on."),
    commands: agentCommands,
  }, ["channelId", "commands"]),
  "agents.conversations.setProperties": operation("agents.conversations.setProperties", "Set Agent Channel Properties", "Update a code channel's title, status, context bar, or agent resource. Provide at least one property.", {
    channelId: str("Code channel ID to update."),
    title: str("New display title for the agent session.", { maxLength: 200 }),
    status: sessionStatus,
    codeChannel: jsonObject("Partial code-channel properties, including context_bar_items."),
    agentResource: jsonObject("Partial agent resource properties."),
  }, ["channelId"], { requiredGroups: [["title", "status", "codeChannel", "agentResource"]] }),
  "agents.conversations.setView": operation("agents.conversations.setView", "Set Agent Channel View", "Create or update an HTML, diff, Block Kit, canvas, or pull-request view tab on a code channel.", {
    channelId: str("Code channel ID to render the view in."),
    type: str("View type. html and diff need content; block_kit needs blocks; canvas needs canvasId; pull_request needs prUrl.", { enum: ["html", "diff", "block_kit", "canvas", "pull_request"] }),
    viewKey: str("Stable agent-assigned view identity. Required for html, block_kit, and canvas views."),
    content: str("HTML document or unified diff text. Capped by Slack at 1 MiB."),
    blocks: jsonObjects("Block Kit blocks. Required when type is block_kit."),
    canvasId: str("Encoded canvas ID. Required when type is canvas."),
    accessLevel: str("Canvas tab access granted to the channel.", { enum: ["read", "write", "comment"] }),
    agentContentHash: str("Opaque hash of the last markdown the agent wrote to a canvas view."),
    prUrl: str("HTTPS pull-request URL. Required when type is pull_request.", { format: "uri" }),
    baseBranch: str("Display-only base branch for a diff view."),
    headBranch: str("Display-only head branch for a diff view."),
    name: str("View tab label."),
    label: str("Deprecated alias for name."),
    csp: jsonObject("Content-Security-Policy domain declarations for an HTML view."),
  }, ["channelId"]),
  "agents.sessions.rename": operation("agents.sessions.rename", "Rename Agent Session", "Rename an agent session. For a session channel this also renames the channel.", {
    title: str("New session title.", { maxLength: 200 }),
    channelId: str("Channel ID containing the session. Required for public channels."),
    threadTs: str("Thread root timestamp for thread-based sessions. Omit for session channels."),
  }, ["title"]),
  "agents.sessions.setStatus": operation("agents.sessions.setStatus", "Set Agent Session Status", "Set an agent session's lifecycle status, creating the session if needed. Uses chat:write.", {
    status: sessionStatus,
    channelId: str("Channel ID containing the session. Required for public channels."),
    threadTs: str("Thread root timestamp for thread-based sessions. Omit for session channels."),
    title: str("Title used only when creating a new session.", { maxLength: 200 }),
    initiatorUserId: str("User who started the session. Used only when creating a new session."),
    iconEmoji: str("Emoji used as the agent icon. Requires chat:write.customize."),
    iconUrl: str("HTTPS URL used as the agent icon.", { format: "uri" }),
    username: str("Display-name override for the agent.", { maxLength: 200 }),
  }, ["status"]),
  "entity.presentDetails": operation("entity.presentDetails", "Present Work Object Details", "Send per-user Work Object flexpane metadata in response to entity_details_requested.", {
    triggerId: str("Trigger ID from the original user action."),
    metadata: jsonObject("Work Object flexpane metadata keyed by entity ID."),
    userAuthRequired: bool("When true, the user must authenticate before full flexpane data is shown."),
    userAuthUrl: str("HTTPS URL where the user authenticates.", { format: "uri" }),
    error: jsonObject("Error payload when the entity cannot be presented."),
  }, ["triggerId"]),
  "entity.presentComments": operation("entity.presentComments", "Present Work Object Comments", "Send per-user Work Object comments in response to entity_comments_requested.", {
    triggerId: str("Trigger ID from the original user action."),
    comments: jsonObjects("Comments to show in the flexpane.", 1, 100),
    cursor: str("App-supplied pagination cursor returned on the next comments request."),
    canPostComment: bool("Whether the user may post comments."),
    deleteActionId: str("Block action ID sent when a comment is deleted."),
    userAuthRequired: bool("When true, the user must authenticate before comments load."),
    userAuthUrl: str("HTTPS URL where the user authenticates.", { format: "uri" }),
    error: jsonObject("Error payload when comments cannot be presented."),
  }, ["triggerId", "comments"]),
  "entity.acknowledgeCommentAction": operation("entity.acknowledgeCommentAction", "Acknowledge Work Object Comment Action", "Confirm that a Work Object comment post, edit, or delete was processed.", {
    triggerId: str("Trigger ID from the comment mutation."),
    comment: jsonObject("Persisted comment payload. Required for post and edit actions."),
    error: str("Error message when the mutation could not be completed."),
  }, ["triggerId"]),
  "team.externalTeams.list": operation("team.externalTeams.list", "List Slack Connect Teams", "List external organizations connected via Slack Connect. Slack documents GET; this connector still POSTs JSON like the other methods.", {
    limit: int("Maximum connected teams to return.", 1, 1000),
    cursor: str("Pagination cursor from a previous response."),
    sortField: str("Field to sort by.", { enum: ["team_name", "last_active_timestamp", "connection_status"] }),
    sortDirection: str("Sort direction.", { enum: ["asc", "desc"] }),
    slackConnectPrefFilter: {
      type: "array",
      description: "Slack Connect preference overrides to filter by.",
      items: str("Slack Connect preference.", {
        enum: ["approved_orgs_only", "allow_sc_file_uploads", "profile_visibility", "away_team_sc_invite_permissions", "accept_sc_invites", "sc_mpdm_to_private", "require_sc_channel_for_sc_dm", "external_awareness_context_bar"],
      }),
      minItems: 1,
      maxItems: 8,
    },
    workspaceFilter: strings("Workspace IDs whose connected orgs should be listed."),
    connectionStatusFilter: str("Connection status to filter by.", { enum: ["CONNECTED", "DISCONNECTED", "BLOCKED", "IN_REVIEW"] }),
  }),
  "team.externalTeams.disconnect": operation("team.externalTeams.disconnect", "Disconnect Slack Connect Team", "Disconnect Slack Connect channels and DMs with an external organization. The disconnect job runs in the background.", {
    targetTeam: str("Team ID of the external organization to disconnect."),
  }, ["targetTeam"]),
  "workflows.featured.list": operation("workflows.featured.list", "List Featured Workflows", "List featured workflow triggers for one or more channels. Uses bookmarks:read.", {
    channelIds: { ...strings("Channel IDs whose featured workflows should be listed."), maxItems: 100 },
  }, ["channelIds"]),
  "workflows.featured.add": operation("workflows.featured.add", "Add Featured Workflows", "Add link-trigger workflows to a channel's featured list without replacing existing entries.", {
    channelId: str("Channel ID that should feature the workflows."),
    triggerIds: triggerIds("Link-trigger IDs to add.", 1),
  }, ["channelId", "triggerIds"]),
  "workflows.featured.remove": operation("workflows.featured.remove", "Remove Featured Workflows", "Remove featured workflow triggers from a channel.", {
    channelId: str("Channel ID to update."),
    triggerIds: triggerIds("Link-trigger IDs to remove.", 1),
  }, ["channelId", "triggerIds"]),
  "workflows.featured.set": operation("workflows.featured.set", "Set Featured Workflows", "Replace a channel's featured workflow list. An empty triggerIds array clears all featured workflows.", {
    channelId: str("Channel ID whose featured workflows should be replaced."),
    triggerIds: triggerIds("Replacement link-trigger IDs. Empty clears the list.", 0),
  }, ["channelId", "triggerIds"]),
  "assistant.search.info": operation("assistant.search.info", "Get Assistant Search Info", "Check whether semantic AI search is enabled for the workspace. Bot tokens use search:read.public, not classic search:read."),
  "assistant.search.context": operation("assistant.search.context", "Search Assistant Context", "Search messages, files, channels, and users with Slack's real-time search. Bot tokens require actionToken from an Events API payload.", {
    query: str("Search query or natural-language question."),
    actionToken: str("Action token from a Slack event payload. Required when calling with a bot token."),
    channelTypes: {
      type: "array",
      description: "Conversation types to search.",
      items: str("Conversation type.", { enum: ["public_channel", "private_channel", "mpim", "im"] }),
      minItems: 1,
      maxItems: 4,
    },
    contentTypes: {
      type: "array",
      description: "Content types to include.",
      items: str("Content type.", { enum: ["messages", "files", "channels", "users"] }),
      minItems: 1,
      maxItems: 4,
    },
    includeBots: bool("Include bot messages."),
    includeDeletedUsers: bool("Include deleted users in user results."),
    before: int("Unix timestamp upper bound.", 0),
    after: int("Unix timestamp lower bound.", 0),
    includeContextMessages: bool("Include surrounding messages for each result."),
    contextChannelId: str("Optional channel context hint. Prefer query modifiers to restrict to one channel."),
    cursor: str("Pagination cursor from a previous response."),
    limit: int("Maximum results per page.", 1, 20),
    sort: str("Sort field. timestamp uses keyword retrieval.", { enum: ["score", "timestamp"] }),
    sortDir: str("Sort direction.", { enum: ["asc", "desc"] }),
    includeMessageBlocks: bool("Include message blocks in the response."),
    highlight: bool("Highlight matching terms in results."),
    termClauses: { ...strings("Conjunctive search term clauses.", 1), maxItems: 5 },
    modifiers: str("Additional search modifiers such as has:pin or before:yesterday."),
    includeArchivedChannels: bool("Include archived channels."),
    disableSemanticSearch: bool("Force keyword-only search even when AI search is enabled."),
  }, ["query", "actionToken"]),
  "workflows.triggers.permissions.list": operation("workflows.triggers.permissions.list", "List Workflow Trigger Permissions", "Read who can run a workflow trigger. Bot tokens need triggers:read.", {
    triggerId: str("Encoded trigger ID."),
  }, ["triggerId"]),
  "workflows.triggers.permissions.add": operation("workflows.triggers.permissions.add", "Add Workflow Trigger Permissions", "Grant named entities permission to run a trigger. Provide at least one of userIds, channelIds, teamIds, or orgIds.", {
    triggerId: str("Encoded trigger ID."),
    ...namedEntities,
  }, ["triggerId"], { requiredAny: ["userIds", "channelIds", "teamIds", "orgIds"] }),
  "workflows.triggers.permissions.remove": operation("workflows.triggers.permissions.remove", "Remove Workflow Trigger Permissions", "Revoke named-entity permission to run a trigger. Provide at least one of userIds, channelIds, teamIds, or orgIds.", {
    triggerId: str("Encoded trigger ID."),
    ...namedEntities,
  }, ["triggerId"], { requiredAny: ["userIds", "channelIds", "teamIds", "orgIds"] }),
  "workflows.triggers.permissions.set": operation("workflows.triggers.permissions.set", "Set Workflow Trigger Permissions", "Set a trigger's permission type. named_entities also needs at least one entity list.", {
    triggerId: str("Encoded trigger ID."),
    permissionType: str("Who may run the trigger.", { enum: ["everyone", "app_collaborators", "named_entities"] }),
    ...namedEntities,
  }, ["triggerId", "permissionType"]),
  "apps.auth.external.get": operation("apps.auth.external.get", "Get External Auth Token", "Retrieve an external OAuth token stored by Slack for a function or workflow step.", {
    externalTokenId: str("External token ID, typically starting with Et."),
    forceRefresh: bool("Refresh the token even when it has not expired."),
  }, ["externalTokenId"]),
  "apps.auth.external.delete": operation("apps.auth.external.delete", "Delete External Auth Token", "Delete Slack-stored external auth tokens. Provide appId, providerKey, or externalTokenId.", {
    appId: str("App ID whose tokens should be deleted."),
    providerKey: str("External auth provider key whose tokens should be deleted."),
    externalTokenId: str("Specific external token ID to delete."),
  }, [], { requiredAny: ["appId", "providerKey", "externalTokenId"] }),
};

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_INPUT_BYTES = 64 * 1024;
const SLACK_API = "https://slack.com/api/";

export function buildSlackExpandedManifestOperations(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(SLACK_EXPANDED_OPERATIONS).map(([key, definition]) => {
    const inputSchema: Record<string, unknown> = {
      type: "object",
      properties: definition.properties,
      required: definition.required,
      additionalProperties: false,
    };
    if (definition.requiredAny) {
      inputSchema.anyOf = definition.requiredAny.map((field) => ({ required: [field] }));
    }
    if (definition.requiredGroups) {
      inputSchema.allOf = definition.requiredGroups.map((group) => ({ anyOf: group.map((field) => ({ required: [field] })) }));
    }
    if (definition.exclusive) {
      inputSchema.oneOf = definition.exclusive.map((field) => ({ required: [field] }));
    }
    return [key, {
      kind: "action",
      timeoutMs: 10000,
      maxInputBytes: MAX_INPUT_BYTES,
      maxResponseBytes: MAX_RESPONSE_BYTES,
      title: definition.title,
      description: definition.description,
      inputSchema,
      outputSchema: {
        type: "object",
        properties: { data: { type: "object", description: "Unmodified Slack Web API success response." } },
        required: ["data"],
      },
    }];
  }));
}

export const slackExpandedActionHandlers: Record<string, SlackExpandedHandler> = Object.fromEntries(
  Object.entries(SLACK_EXPANDED_OPERATIONS).map(([key, definition]) => [key, createHandler(key, definition)]),
);

function createHandler(key: string, definition: SlackOperation): SlackExpandedHandler {
  return async (rawInput) => {
    const { params, token, fetcher } = validateInput(key, definition, rawInput);
    if (!token) return { connector: "slack", action: key, source: "connector", validated: params };
    if (new TextEncoder().encode(JSON.stringify(params)).byteLength > MAX_INPUT_BYTES) {
      throw actionError("INVALID_ACTION_INPUT", `Input for slack.${key} is too large.`);
    }

    let response: Response;
    try {
      response = await fetcher(`${SLACK_API}${definition.method}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(params),
        redirect: "error",
      });
    } catch {
      throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack request failed.");
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : undefined;
      throw {
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
      };
    }

    const payload = await readSlackJson(response);
    if (!response.ok || payload.ok !== true) {
      const providerError = typeof payload.error === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(payload.error)
        ? payload.error
        : undefined;
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: `Slack rejected the ${definition.method} request.`,
        ...(providerError ? { providerError } : {}),
      };
    }
    return { connector: "slack", action: key, source: "connector", data: payload };
  };
}

function validateInput(
  operationKey: string,
  definition: SlackOperation,
  rawInput: unknown,
): { params: Record<string, unknown>; token?: string; fetcher: typeof fetch } {
  if (!isRecord(rawInput)) throw invalidInput(operationKey);
  const schemaKeys = new Set(Object.keys(definition.properties));
  for (const key of Object.keys(rawInput)) {
    if (key !== "token" && key !== "fetch" && !schemaKeys.has(key)) throw invalidInput(operationKey);
  }

  const tokenValue = rawInput.token;
  if (tokenValue !== undefined && (typeof tokenValue !== "string" || /[\r\n]/.test(tokenValue) || tokenValue.length > 8192)) {
    throw invalidInput(operationKey);
  }
  const fetchValue = rawInput.fetch;
  if (fetchValue !== undefined && typeof fetchValue !== "function") throw invalidInput(operationKey);

  for (const field of definition.required) {
    if (!(field in rawInput) || rawInput[field] === undefined) throw invalidInput(operationKey);
  }
  if (definition.requiredAny && !definition.requiredAny.some((field) => hasValue(rawInput[field]))) throw invalidInput(operationKey);
  if (definition.requiredGroups?.some((group) => !group.some((field) => hasValue(rawInput[field])))) throw invalidInput(operationKey);
  if (definition.exclusive && definition.exclusive.filter((field) => hasValue(rawInput[field])).length > 1) throw invalidInput(operationKey);

  const params: Record<string, unknown> = {};
  for (const [field, schema] of Object.entries(definition.properties)) {
    if (!(field in rawInput) || rawInput[field] === undefined) continue;
    const value = rawInput[field];
    if (!matchesSchema(schema, value)) throw invalidInput(operationKey);
    const mapped = definition.csvFields?.includes(field) && Array.isArray(value)
      ? value.join(",")
      : value;
    params[toSlackParameter(field)] = mapped;
  }

  const fetcher = (fetchValue as typeof fetch | undefined) ?? fetch;
  return { params, ...(typeof tokenValue === "string" && tokenValue.trim() ? { token: tokenValue.trim() } : {}), fetcher };
}

function matchesSchema(schema: JsonSchema, value: unknown): boolean {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string" || value.trim().length === 0) return false;
      if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
      if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
      if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
      if (schema.format === "uri") {
        try {
          const url = new URL(value);
          if (url.protocol !== "https:" || url.username || url.password) return false;
        } catch {
          return false;
        }
      }
      return true;
    }
    case "integer":
    case "number":
      return typeof value === "number" && Number.isFinite(value) &&
        (schema.type !== "integer" || Number.isInteger(value)) &&
        (typeof schema.minimum !== "number" || value >= schema.minimum) &&
        (typeof schema.maximum !== "number" || value <= schema.maximum);
    case "boolean":
      return typeof value === "boolean";
    case "array": {
      if (!Array.isArray(value)) return false;
      if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
      if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
      const itemSchema = schema.items as JsonSchema | undefined;
      return !itemSchema || value.every((item) => matchesSchema(itemSchema, item));
    }
    case "object": {
      if (!isRecord(value)) return false;
      if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties) return false;
      if (typeof schema.maxProperties === "number" && Object.keys(value).length > schema.maxProperties) return false;
      if (!isRecord(schema.properties)) return true;
      const properties = schema.properties as Record<string, JsonSchema>;
      if (schema.additionalProperties === false && Object.keys(value).some((key) => !(key in properties))) return false;
      if (Array.isArray(schema.required) && schema.required.some((key) => typeof key !== "string" || !(key in value))) return false;
      if (!Object.entries(value).every(([key, item]) => !properties[key] || matchesSchema(properties[key], item))) return false;
      const anyOf = schema.anyOf as Array<Record<string, unknown>> | undefined;
      return !anyOf || anyOf.some((condition) => matchesObjectCondition(condition, value));
    }
    default:
      return false;
  }
}

function matchesObjectCondition(condition: Record<string, unknown>, value: Record<string, unknown>): boolean {
  if (Array.isArray(condition.required) && condition.required.some((key) => typeof key !== "string" || !(key in value))) {
    return false;
  }
  if (isRecord(condition.properties)) {
    for (const [key, schema] of Object.entries(condition.properties)) {
      if (key in value && !matchesSchema(schema as JsonSchema, value[key])) return false;
    }
    if (condition.additionalProperties === false && Object.keys(value).some((key) => !(key in condition.properties))) return false;
  }
  return !isRecord(condition.not) || !matchesObjectCondition(condition.not, value);
}

async function readSlackJson(response: Response): Promise<Record<string, unknown>> {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack response exceeded the supported size limit.");
  }
  if (!response.body) throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack returned an empty response.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* response is already discarded */ }
        throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack response exceeded the supported size limit.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (isConnectorError(error)) throw error;
    throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack response could not be read.");
  } finally {
    try { reader.releaseLock(); } catch { /* stream may have been canceled */ }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack returned an invalid JSON response.");
  }
  if (!isRecord(payload)) throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack returned an invalid response shape.");
  return payload;
}

function toSlackParameter(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function invalidInput(operationKey: string): Record<string, unknown> {
  return actionError("INVALID_ACTION_INPUT", `Invalid input for slack.${operationKey}.`);
}

function actionError(code: string, message: string): Record<string, unknown> {
  return { ok: false, code, message };
}

function isConnectorError(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.code === "string";
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
