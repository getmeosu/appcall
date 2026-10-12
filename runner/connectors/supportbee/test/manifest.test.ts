import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "labels.list", "teams.list", "tickets.get", "tickets.list"];
const COMPOSIO: Record<string, string> = {
  "SUPPORTBEE_ADD_LABEL_TO_TICKET": "tickets.labels.add",
  "SUPPORTBEE_ARCHIVE_TICKET": "tickets.archive",
  "SUPPORTBEE_ASSIGN_TICKET_TO_TEAM": "tickets.assign.team",
  "SUPPORTBEE_CREATE_COMMENT": "comments.create",
  "SUPPORTBEE_CREATE_CONSEQUENCE": "consequences.create",
  "SUPPORTBEE_CREATE_EMAIL": "emails.create",
  "SUPPORTBEE_CREATE_FILTER": "filters.create",
  "SUPPORTBEE_CREATE_RULE": "rules.create",
  "SUPPORTBEE_CREATE_SNIPPET": "snippets.create",
  "SUPPORTBEE_CREATE_TICKET": "tickets.create",
  "SUPPORTBEE_CREATE_TICKET_REPLY": "replies.create",
  "SUPPORTBEE_CREATE_USER_OR_CUSTOMER_GROUP": "users.create",
  "SUPPORTBEE_DELETE_SNIPPET": "snippets.delete",
  "SUPPORTBEE_DELETE_TICKET": "tickets.delete",
  "SUPPORTBEE_FETCH_EMAILS": "emails.list",
  "SUPPORTBEE_FETCH_LABELS": "labels.list",
  "SUPPORTBEE_FETCH_SNIPPETS": "snippets.list",
  "SUPPORTBEE_FETCH_TEAMS": "teams.list",
  "SUPPORTBEE_GET_AVG_FIRST_RESPONSE_TIME_REPORT": "reports.avg_first_response_time",
  "SUPPORTBEE_GET_REPLIES_COUNT_REPORT": "reports.replies_count",
  "SUPPORTBEE_GET_TICKET": "tickets.get",
  "SUPPORTBEE_GET_TICKETS_COUNT_REPORT": "reports.tickets_count",
  "SUPPORTBEE_LIST_TICKET_COMMENTS": "comments.list",
  "SUPPORTBEE_LIST_TICKET_REPLIES": "replies.list",
  "SUPPORTBEE_LIST_TICKETS": "tickets.list",
  "SUPPORTBEE_LIST_USERS": "users.list",
  "SUPPORTBEE_MARK_TICKET_AS_ANSWERED": "tickets.answered",
  "SUPPORTBEE_MARK_TICKET_AS_SPAM": "tickets.spam",
  "SUPPORTBEE_MARK_TICKET_AS_UNANSWERED": "tickets.unanswered",
  "SUPPORTBEE_REMOVE_LABEL_FROM_TICKET": "tickets.labels.remove",
  "SUPPORTBEE_SEARCH_TICKETS": "tickets.search",
  "SUPPORTBEE_SHOW_TICKET_REPLY": "replies.get",
  "SUPPORTBEE_SHOW_USER_OR_CUSTOMER_GROUP": "users.get",
  "SUPPORTBEE_TRASH_TICKET": "tickets.trash",
  "SUPPORTBEE_UNARCHIVE_TICKET": "tickets.unarchive",
  "SUPPORTBEE_UNASSIGN_TICKET_FROM_TEAM": "tickets.unassign.team",
  "SUPPORTBEE_UNASSIGN_TICKET_FROM_USER": "tickets.unassign.user",
  "SUPPORTBEE_UNMARK_TICKET_AS_SPAM": "tickets.unspam",
  "SUPPORTBEE_UNTRASH_TICKET": "tickets.untrash",
  "SUPPORTBEE_UPDATE_SNIPPET": "snippets.update",
  "SUPPORTBEE_UPDATE_USER": "users.update",
};

describe("supportbee manifest", () => {
  it("keeps origin identity and bumps the deepen version", () => {
    expect(manifest.key).toBe("supportbee");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.visibility).toBe("public");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://{{company}}.supportbee.com");
    expect(manifest.network.allowedHosts).toEqual(["*.supportbee.com"]);
    expect(ORIGIN_OPS.every((key) => key in operations)).toBe(true);
  });

  it("maps every Composio SupportBee tool onto a real action", () => {
    expect(Object.keys(COMPOSIO)).toHaveLength(41);
    for (const [tool, op] of Object.entries(COMPOSIO)) {
      expect(operations[op], tool).toBeDefined();
      expect((operations[op].request as { path?: string }).path, tool).toBeDefined();
    }
    expect(Object.keys(operations).sort()).toEqual(
      ["healthcheck", ...new Set(Object.values(COMPOSIO))].sort(),
    );
  });

  it("gives every action a request block, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      const request = operation.request as Record<string, unknown>;
      expect(request, `${key} must declare a request block`).toBeDefined();
      expect(["GET", "POST", "PUT", "PATCH", "DELETE"]).toContain(request.method);
      expect(typeof request.path).toBe("string");
      expect((request.timeoutMs as number | undefined) ?? (operation.timeoutMs as number)).toBeGreaterThan(0);
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.validationMode).toBe("strict-generated");
      expect(operation.responseFormat).toBe("json");
    }
  });

  it("only interpolates path placeholders declared on the operation schema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path {{${placeholder}}}`).toContain(placeholder);
        expect(schema.properties ?? {}, `${key} path {{${placeholder}}}`).toHaveProperty(placeholder);
      }
    }
  });

  it("marks permanent deletes destructive and does not declare webhooks", () => {
    expect(operations["tickets.delete"].sideEffect).toBe("destructive");
    expect(operations["snippets.delete"].sideEffect).toBe("destructive");
    expect(operations["tickets.archive"].sideEffect).toBe("write");
    expect(operations.healthcheck.sideEffect).toBe("read");
    for (const key of Object.keys(operations)) {
      expect(key.startsWith("webhook.")).toBe(false);
    }
  });
});
