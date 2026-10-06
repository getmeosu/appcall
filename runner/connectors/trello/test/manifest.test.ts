import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const actionOperations = Object.fromEntries(
  Object.entries(operations).filter(([, operation]) => operation.kind === "action"),
);
const webhookOperations = Object.fromEntries(
  Object.entries(operations).filter(([, operation]) => operation.kind === "webhook"),
);

const EXPECTED_ACTIONS = [
  "actions.delete",
  "actions.get",
  "actions.get-actions",
  "actions.list",
  "actions.list-actions",
  "actions.list-actions-2",
  "actions.list-actions-3",
  "actions.list-actions-4",
  "actions.update",
  "admins.delete",
  "admins.list",
  "admins.update",
  "all.delete",
  "archive-all-cards.create",
  "associated-domain.delete",
  "attachments.delete",
  "attachments.get",
  "auditlog.list",
  "batch.list",
  "board-backgrounds.delete",
  "board-backgrounds.get",
  "board-backgrounds.list",
  "board-backgrounds.update",
  "board-plugins.create",
  "board-plugins.delete",
  "board-plugins.list",
  "board-stars.create",
  "board-stars.delete",
  "board-stars.get",
  "board-stars.list",
  "board-stars.list-board-stars",
  "board-stars.update",
  "board.create",
  "board.delete",
  "board.getCards",
  "board.getLists",
  "board.list",
  "board.list-board",
  "board.list-board-2",
  "board.list-board-3",
  "board.list-board-4",
  "board.update",
  "boards-invited.list",
  "boards.delete",
  "boards.get",
  "boards.get-boards",
  "boards.list-boards",
  "bulk.get",
  "bulk.get-bulk",
  "bulk.update",
  "card.addChecklist",
  "card.addComment",
  "card.addLabel",
  "card.addMember",
  "card.attachments.create",
  "card.attachments.list",
  "card.create",
  "card.delete",
  "card.get",
  "card.list",
  "card.list-card",
  "card.removeLabel",
  "card.removeMember",
  "card.update",
  "cards.get",
  "cards.get-cards-2",
  "cards.list-cards",
  "cards.list-cards-3",
  "check-item-states.list",
  "check-item.delete",
  "check-item.get",
  "check-item.update",
  "check-item.update-check-item",
  "check-items.delete",
  "check-items.get",
  "check-items.list",
  "checklist.addItem",
  "checklists.create-checklists",
  "checklists.delete",
  "checklists.delete-checklists",
  "checklists.get",
  "checklists.get-checklists",
  "checklists.list",
  "checklists.list-checklists",
  "checklists.update",
  "checklists.update-checklists",
  "claimable-organizations.list",
  "closed.update",
  "comments.delete",
  "comments.update",
  "compliance.list",
  "custom-board-backgrounds.delete",
  "custom-board-backgrounds.get",
  "custom-board-backgrounds.list",
  "custom-board-backgrounds.update",
  "custom-emoji.get",
  "custom-emoji.list",
  "custom-field-items.list",
  "custom-fields.create",
  "custom-fields.delete",
  "custom-fields.get",
  "custom-fields.list",
  "custom-fields.update",
  "custom-fields.update-custom-fields",
  "custom-stickers.delete",
  "custom-stickers.get",
  "custom-stickers.list",
  "deactivated.update",
  "deactivated.update-deactivated",
  "email-position.update",
  "emoji.list",
  "enterprises.get",
  "exports.create",
  "exports.create-exports",
  "exports.delete",
  "exports.get",
  "exports.list",
  "generate.create",
  "generate.create-generate",
  "healthcheck",
  "id-board.update",
  "id-email-list.update",
  "id-tags.create",
  "item.update",
  "label.create",
  "label.list",
  "labels.create",
  "labels.create-labels",
  "labels.delete",
  "labels.get",
  "labels.update",
  "labels.update-labels",
  "licensed.update",
  "list.create",
  "list.getCards",
  "list.list",
  "list.list-list",
  "list.list-list-2",
  "list.moveAllCards",
  "list.update",
  "listings.create",
  "listings.update",
  "lists.create",
  "lists.get",
  "lists.get-lists",
  "lists.update-lists",
  "logo.delete",
  "mark-as-viewed.create",
  "mark-associated-notifications-read.create",
  "member-creator.list",
  "member-creator.list-member-creator",
  "member-privacy.list",
  "member.get",
  "member.getBoards",
  "member.list",
  "member.list-member",
  "member.list-member-2",
  "members-voted.create",
  "members-voted.delete",
  "members-voted.list",
  "members.delete",
  "members.delete-members",
  "members.get",
  "members.get-members-2",
  "members.list",
  "members.list-members",
  "members.list-members-2",
  "members.list-members-3",
  "members.list-members-4",
  "members.update",
  "members.update-members",
  "members.update-members-2",
  "members.update-members-3",
  "members.update-members-4",
  "memberships.get",
  "memberships.list",
  "memberships.list-memberships",
  "memberships.update",
  "most-recent.list",
  "new-billable-guests.get",
  "notification-channel-settings.get",
  "notification-channel-settings.list",
  "notification-channel-settings.update",
  "notification-channel-settings.update-notification-channel-settings",
  "notification-channel-settings.update-notification-channel-settings-2",
  "notifications.get",
  "notifications.get-notifications",
  "notifications.list",
  "notifications.update",
  "one-time-messages-dismissed.create",
  "options.create",
  "options.delete",
  "options.get",
  "options.list",
  "org-invite-restrict.delete",
  "organization.get",
  "organization.list",
  "organization.list-organization",
  "organizations-invited.list",
  "organizations.create",
  "organizations.delete",
  "organizations.delete-organizations",
  "organizations.get",
  "organizations.get-organizations",
  "organizations.list",
  "organizations.list-organizations",
  "organizations.update",
  "organizations.update-organizations",
  "pending-organizations.list",
  "plugin-data.list",
  "plugin-data.list-plugin-data",
  "plugins.list",
  "plugins.list-plugins",
  "plugins.update",
  "query.list",
  "reactions-summary.list",
  "reactions.create",
  "reactions.delete",
  "reactions.get",
  "reactions.list",
  "read.create",
  "saved-searches.create",
  "saved-searches.delete",
  "saved-searches.get",
  "saved-searches.list",
  "saved-searches.update",
  "search.query",
  "show-sidebar-activity.update",
  "show-sidebar-board-actions.update",
  "show-sidebar-members.update",
  "show-sidebar.update",
  "signup-url.list",
  "stickers.create",
  "stickers.delete",
  "stickers.get",
  "stickers.list",
  "stickers.update",
  "tags.create",
  "tags.delete",
  "tags.list",
  "text.update",
  "tokens.create",
  "tokens.delete",
  "tokens.get",
  "tokens.list",
  "unread.update",
  "webhooks.create",
  "webhooks.create-webhooks",
  "webhooks.delete",
  "webhooks.delete-webhooks",
  "webhooks.get",
  "webhooks.get-webhooks",
  "webhooks.get-webhooks-2",
  "webhooks.list",
  "webhooks.update",
  "webhooks.update-webhooks",
];

const EXPECTED_WEBHOOKS = [
  "webhook.acceptEnterpriseJoinRequest",
  "webhook.addAttachmentToCard",
  "webhook.addChecklistToCard",
  "webhook.addLabelToCard",
  "webhook.addMemberToBoard",
  "webhook.addMemberToOrganization",
  "webhook.addOrganizationToEnterprise",
  "webhook.addToEnterprisePluginWhitelist",
  "webhook.addToOrganizationBoard",
  "webhook.board_updated",
  "webhook.card_comment",
  "webhook.card_created",
  "webhook.card_deleted",
  "webhook.card_updated",
  "webhook.checklist_updated",
  "webhook.convertToCardFromCheckItem",
  "webhook.copyBoard",
  "webhook.copyCard",
  "webhook.copyChecklist",
  "webhook.copyCommentCard",
  "webhook.createBoard",
  "webhook.createBoardInvitation",
  "webhook.createBoardPreference",
  "webhook.createCheckItem",
  "webhook.createLabel",
  "webhook.createOrganization",
  "webhook.createOrganizationInvitation",
  "webhook.deactivatedMemberInBoard",
  "webhook.deactivatedMemberInEnterprise",
  "webhook.deactivatedMemberInOrganization",
  "webhook.deleteAttachmentFromCard",
  "webhook.deleteBoardInvitation",
  "webhook.deleteCheckItem",
  "webhook.deleteComment",
  "webhook.deleteLabel",
  "webhook.deleteOrganizationInvitation",
  "webhook.disableEnterprisePluginWhitelist",
  "webhook.disablePlugin",
  "webhook.disablePowerUp",
  "webhook.emailCard",
  "webhook.enableEnterprisePluginWhitelist",
  "webhook.enablePlugin",
  "webhook.enablePowerUp",
  "webhook.list_created",
  "webhook.makeAdminOfBoard",
  "webhook.makeAdminOfOrganization",
  "webhook.makeNormalMemberOfBoard",
  "webhook.makeNormalMemberOfOrganization",
  "webhook.makeObserverOfBoard",
  "webhook.memberJoinedTrello",
  "webhook.member_added",
  "webhook.moveCardFromBoard",
  "webhook.moveCardToBoard",
  "webhook.moveListFromBoard",
  "webhook.moveListToBoard",
  "webhook.reactivatedMemberInBoard",
  "webhook.reactivatedMemberInEnterprise",
  "webhook.reactivatedMemberInOrganization",
  "webhook.removeChecklistFromCard",
  "webhook.removeFromEnterprisePluginWhitelist",
  "webhook.removeFromOrganizationBoard",
  "webhook.removeLabelFromCard",
  "webhook.removeMemberFromBoard",
  "webhook.removeMemberFromCard",
  "webhook.removeMemberFromOrganization",
  "webhook.removeOrganizationFromEnterprise",
  "webhook.sortList",
  "webhook.unconfirmedBoardInvitation",
  "webhook.unconfirmedOrganizationInvitation",
  "webhook.updateCheckItem",
  "webhook.updateCheckItemStateOnCard",
  "webhook.updateComment",
  "webhook.updateLabel",
  "webhook.updateList",
  "webhook.updateMember",
  "webhook.updateOrganization",
  "webhook.voteOnCard",
];

describe("trello manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("trello");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models).toEqual(expect.arrayContaining(["card", "list", "board", "checklist", "member", "label", "attachment"]));
  });

  it("declares api_key setup, since Trello is OAuth 1.0a only and the runner rejects a 1.0a manifest", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
  });

  it("targets the single documented API host", () => {
    expect(manifest.http.baseUrl).toBe("https://api.trello.com/1");
    expect(manifest.network.allowedHosts).toEqual(["api.trello.com"]);
  });

  it("backs off on the documented 10-second window, since no Retry-After header is documented", () => {
    expect(manifest.http.errors.rateLimitStatuses).toEqual([429]);
    expect(manifest.http.errors.defaultRetryAfterSeconds).toBe(10);
  });

  it("reads the provider's own error text from message, falling back to the machine code in error", () => {
    expect(manifest.http.errors.messagePaths).toEqual(["message", "error"]);
  });

  it("declares the depth-slice actions and EventOnly webhooks without renaming existing keys", () => {
    expect(Object.keys(actionOperations).sort()).toEqual([...EXPECTED_ACTIONS].sort());
    expect(Object.keys(webhookOperations).sort()).toEqual([...EXPECTED_WEBHOOKS].sort());
    expect(Object.keys(operations).sort()).toEqual([...EXPECTED_ACTIONS, ...EXPECTED_WEBHOOKS].sort());
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(actionOperations)) {
      expect(operation.kind).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
      expect(operation.outputSchema, `${key} must declare an outputSchema`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("declares EventOnly webhooks in the Apollo phone_revealed shape, with no handler", () => {
    for (const [key, operation] of Object.entries(webhookOperations)) {
      expect(operation.kind).toBe("webhook");
      expect(operation.timeoutMs).toBe(30000);
      expect(operation.maxInputBytes).toBe(1048576);
      expect(operation.maxResponseBytes).toBe(1048576);
      expect(operation.request, `${key} must not declare a request`).toBeUndefined();
      expect(operation.inputSchema, `${key} must not declare an inputSchema`).toBeUndefined();
    }
  });

  it("classifies every mutating operation as a write — a safety control, not metadata", () => {
    const writes = Object.entries(actionOperations)
      .filter(([, operation]) => ["POST", "PUT", "PATCH", "DELETE"].includes(String((operation.request as Record<string, unknown>).method)))
      .map(([key]) => key);
    expect(writes.length).toBeGreaterThan(0);
    for (const key of writes) {
      expect(actionOperations[key]!.sideEffect, `${key} mutates and must be sideEffect write`).toBe("write");
    }
  });

  it("keeps every request inside the declared outbound host", () => {
    for (const operation of Object.values(actionOperations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.trello.com");
    }
  });

  it("only interpolates path placeholders the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(actionOperations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("templates every query and body value from a declared input", () => {
    for (const [key, operation] of Object.entries(actionOperations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const declared = Object.keys(schema.properties ?? {});
      const templated = [...JSON.stringify([request.query ?? {}, request.body ?? {}]).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)]
        .map((match) => match[1]!)
        .filter((name) => name.startsWith("input.") === false);
      for (const name of templated) {
        expect(declared, `${key} references {{${name}}}`).toContain(name);
      }
    }
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });

  // --- Connector-specific assertions from the task brief ---

  it("sends both credentials as query parameters, which is what Trello's spec declares", () => {
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("token");
    expect(manifest.http.query.key).toBe("{{apiKey}}");
    // Both must be declared setup fields, or the bundle will not carry them.
    const keys = manifest.auth.setup.fields.map((f: { key: string }) => f.key);
    expect(keys).toContain("apiKey");
    expect(keys).toContain("token");
  });

  it("marks token, not apiKey, as the secret field http.auth.field points at", () => {
    const tokenField = manifest.auth.setup.fields.find((f: { key: string }) => f.key === "token")!;
    const apiKeyField = manifest.auth.setup.fields.find((f: { key: string }) => f.key === "apiKey")!;
    expect(tokenField.secret).toBe(true);
    expect(apiKeyField.secret).not.toBe(true);
    expect(manifest.http.auth.field).toBe("token");
  });

  it("keeps the original writes on the query string, because those Trello routes ignore a JSON body", () => {
    const legacyQueryWrites = [
      "board.create",
      "board.delete",
      "board.update",
      "card.addChecklist",
      "card.addComment",
      "card.addLabel",
      "card.addMember",
      "card.attachments.create",
      "card.create",
      "card.update",
      "checklist.addItem",
      "label.create",
      "list.create",
      "list.moveAllCards",
      "list.update",
    ];
    for (const key of legacyQueryWrites) {
      const request = actionOperations[key]!.request as Record<string, unknown>;
      expect(request.body, `${key} must not send a JSON body`).toBeUndefined();
      expect(request.query, `${key} must carry its parameters in the query string`).toBeDefined();
    }
  });

  it("wraps generated actions in the strict JSON envelope without rewriting legacy result mappings", () => {
    const legacy = new Set([
      "healthcheck",
      "card.create",
      "card.get",
      "card.update",
      "card.delete",
      "card.addComment",
      "card.addChecklist",
      "card.addMember",
      "card.removeMember",
      "card.addLabel",
      "card.removeLabel",
      "card.attachments.create",
      "card.attachments.list",
      "checklist.addItem",
      "list.create",
      "list.update",
      "list.getCards",
      "list.moveAllCards",
      "board.create",
      "board.update",
      "board.delete",
      "board.getLists",
      "board.getCards",
      "label.list",
      "label.create",
      "member.get",
      "member.getBoards",
      "search.query",
    ]);
    for (const [key, operation] of Object.entries(actionOperations)) {
      if (legacy.has(key)) {
        expect(operation.validationMode, key).toBeUndefined();
        continue;
      }
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      const output = operation.outputSchema as { additionalProperties?: boolean; required?: string[] };
      expect(output.additionalProperties, key).toBe(false);
      expect(output.required, key).toEqual(["data"]);
    }
  });

  it("keeps the trailing slash board.create needs", () => {
    expect((operations["board.create"]!.request as Record<string, unknown>).path).toBe("/boards/");
    expect((operations["board.create"]!.request as Record<string, unknown>).method).toBe("POST");
  });

  it("requires idList on card.create, since Trello silently drops an unresolved query param", () => {
    const schema = operations["card.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("idList");
  });

  it("requires name and idBoard on list.create", () => {
    const schema = operations["list.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("name");
    expect(schema.required ?? []).toContain("idBoard");
  });

  it("requires name on board.create", () => {
    const schema = operations["board.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("name");
  });

  it("requires text on card.addComment and name on checklist.addItem", () => {
    const commentSchema = operations["card.addComment"]!.inputSchema as { required?: string[] };
    expect(commentSchema.required ?? []).toContain("text");
    const itemSchema = operations["checklist.addItem"]!.inputSchema as { required?: string[] };
    expect(itemSchema.required ?? []).toContain("name");
  });

  it("requires query on search.query", () => {
    const schema = operations["search.query"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("query");
  });

  it("distinguishes card.update's closed=true archive from card.delete's permanent removal in their descriptions", () => {
    const update = String(operations["card.update"]!.description);
    const del = String(operations["card.delete"]!.description);
    expect(update.toLowerCase()).toContain("archive");
    expect(update).toContain("closed");
    expect(del.toLowerCase()).toContain("permanent");
    expect(del.toLowerCase()).not.toContain("archive the card");
  });

  it("documents that member.getBoards accepts an id, a username, or the literal me", () => {
    const description = String(operations["member.getBoards"]!.description);
    expect(description).toContain("me");
  });

  it("does not invent a cursor for the unpaginated collection endpoints", () => {
    const unpaginated = ["list.getCards", "board.getLists", "board.getCards", "member.getBoards", "card.attachments.list", "label.list"];
    for (const key of unpaginated) {
      const schema = operations[key]!.inputSchema as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {}), `${key} must not declare a cursor`).not.toContain("cursor");
      expect(Object.keys(schema.properties ?? {}), `${key} must not declare an offset`).not.toContain("offset");
      expect(String(operations[key]!.description).toLowerCase()).toContain("entire");
    }
  });

  it("paginates search.query with the documented 0-based cardsPage input, not a cursor", () => {
    const schema = operations["search.query"]!.inputSchema as { properties?: Record<string, unknown> };
    // Inputs are camelCase, matching every other operation in this batch
    // (e.g. gitlab maps perPage -> per_page); the provider's snake_case
    // cards_limit/cards_page only appear in request.query, not the tool
    // surface.
    expect(Object.keys(schema.properties ?? {})).toContain("cardsPage");
    expect(Object.keys(schema.properties ?? {})).toContain("cardsLimit");
    expect(Object.keys(schema.properties ?? {})).not.toContain("cards_page");
    expect(Object.keys(schema.properties ?? {})).not.toContain("cards_limit");
    const requestQuery = (operations["search.query"]!.request as Record<string, unknown>).query as Record<string, unknown>;
    expect(requestQuery.cards_limit).toBe("{{cardsLimit}}");
    expect(requestQuery.cards_page).toBe("{{cardsPage}}");
    const description = String(operations["search.query"]!.description);
    expect(description).toContain("0-based");
  });

  it("does not declare a trello.com host, since the authorize redirect is not implemented", () => {
    expect(manifest.network.allowedHosts).not.toContain("trello.com");
  });

  it("closes a board on board.delete rather than permanently deleting it", () => {
    const request = actionOperations["board.delete"]!.request as Record<string, unknown>;
    expect(request.method).toBe("PUT");
    expect(request.path).toBe("/boards/{{id}}");
    expect((request.query as Record<string, unknown>).closed).toBe("true");
    expect(String(actionOperations["board.delete"]!.description).toLowerCase()).toContain("close");
  });

  it("moves every card off a list onto a destination list on the same or another board", () => {
    const schema = actionOperations["list.moveAllCards"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toEqual(expect.arrayContaining(["id", "idBoard", "idList"]));
    const request = actionOperations["list.moveAllCards"]!.request as Record<string, unknown>;
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/lists/{{id}}/moveAllCards");
  });

  it("attaches a URL rather than a multipart file on card.attachments.create", () => {
    const schema = actionOperations["card.attachments.create"]!.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
    expect(schema.required ?? []).toEqual(expect.arrayContaining(["id", "url"]));
    expect(Object.keys(schema.properties ?? {})).not.toContain("file");
    const request = actionOperations["card.attachments.create"]!.request as Record<string, unknown>;
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/cards/{{id}}/attachments");
  });
});
