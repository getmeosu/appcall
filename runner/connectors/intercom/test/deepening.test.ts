import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);

const ORIGINAL = [
  "admins.get",
  "admins.list",
  "companies.create",
  "companies.get",
  "companies.list",
  "contacts.create",
  "contacts.delete",
  "contacts.get",
  "contacts.list",
  "contacts.tag",
  "contacts.update",
  "conversations.assign",
  "conversations.close",
  "conversations.get",
  "conversations.list",
  "conversations.reply",
  "conversations.search",
  "conversations.tag",
  "healthcheck",
  "tags.create",
  "tags.list",
  "tickets.create",
  "tickets.list",
  "tickets.reply",
] as const;

const routes = [
  ["contacts.archive", "POST", "/contacts/contact-1/archive", {"id": "contact-1"} as Record<string, unknown>],
  ["contacts.unarchive", "POST", "/contacts/contact-1/unarchive", {"id": "contact-1"} as Record<string, unknown>],
  ["contacts.block", "POST", "/contacts/contact-1/block", {"id": "contact-1"} as Record<string, unknown>],
  ["contacts.search", "POST", "/contacts/search", {"query": {"field": "email", "operator": "=", "value": "ada@example.com"}, "perPage": 20} as Record<string, unknown>],
  ["contacts.merge", "POST", "/contacts/merge", {"from": "lead-1", "into": "user-1"} as Record<string, unknown>],
  ["contacts.untag", "DELETE", "/contacts/contact-1/tags/tag-1", {"id": "contact-1", "tagId": "tag-1"} as Record<string, unknown>],
  ["contacts.listTags", "GET", "/contacts/contact-1/tags", {"id": "contact-1"} as Record<string, unknown>],
  ["contacts.listCompanies", "GET", "/contacts/contact-1/companies", {"id": "contact-1"} as Record<string, unknown>],
  ["contacts.listSegments", "GET", "/contacts/contact-1/segments", {"id": "contact-1"} as Record<string, unknown>],
  ["contacts.listSubscriptions", "GET", "/contacts/contact-1/subscriptions", {"id": "contact-1"} as Record<string, unknown>],
  ["contacts.addSubscription", "POST", "/contacts/contact-1/subscriptions", {"id": "contact-1", "subscriptionId": "sub-1", "consentType": "opt_in"} as Record<string, unknown>],
  ["contacts.removeSubscription", "DELETE", "/contacts/contact-1/subscriptions/sub-1", {"id": "contact-1", "subscriptionId": "sub-1"} as Record<string, unknown>],
  ["contacts.attachCompany", "POST", "/contacts/contact-1/companies", {"id": "contact-1", "companyId": "co-1"} as Record<string, unknown>],
  ["contacts.detachCompany", "DELETE", "/contacts/contact-1/companies/co-1", {"id": "contact-1", "companyId": "co-1"} as Record<string, unknown>],
  ["contacts.notes.create", "POST", "/contacts/contact-1/notes", {"id": "contact-1", "body": "Called the customer.", "adminId": "991"} as Record<string, unknown>],
  ["contacts.notes.list", "GET", "/contacts/contact-1/notes", {"id": "contact-1"} as Record<string, unknown>],
  ["notes.get", "GET", "/notes/note-1", {"id": "note-1"} as Record<string, unknown>],
  ["contacts.getByExternalId", "GET", "/contacts/find_by_external_id/ada-1", {"externalId": "ada-1"} as Record<string, unknown>],
  ["companies.update", "PUT", "/companies/co-1", {"id": "co-1", "name": "Acme Updated", "industry": "software"} as Record<string, unknown>],
  ["companies.delete", "DELETE", "/companies/co-1", {"id": "co-1"} as Record<string, unknown>],
  ["companies.listContacts", "GET", "/companies/co-1/contacts", {"id": "co-1"} as Record<string, unknown>],
  ["companies.listSegments", "GET", "/companies/co-1/segments", {"id": "co-1"} as Record<string, unknown>],
  ["companies.listNotes", "GET", "/companies/co-1/notes", {"id": "co-1"} as Record<string, unknown>],
  ["companies.scroll", "GET", "/companies/scroll", {"scrollParam": "scroll-1"} as Record<string, unknown>],
  ["companies.retrieve", "GET", "/companies", {"companyId": "acme-1"} as Record<string, unknown>],
  ["conversations.create", "POST", "/conversations", {"fromType": "user", "fromId": "contact-1", "body": "Hello from Ada."} as Record<string, unknown>],
  ["conversations.reopen", "POST", "/conversations/147/parts", {"id": "147", "adminId": "991"} as Record<string, unknown>],
  ["conversations.untag", "DELETE", "/conversations/147/tags/tag-1", {"id": "147", "tagId": "tag-1", "adminId": "991"} as Record<string, unknown>],
  ["conversations.attachContact", "POST", "/conversations/147/customers", {"id": "147", "adminId": "991", "customer": {"id": "contact-2"}} as Record<string, unknown>],
  ["tickets.get", "GET", "/tickets/ticket-1", {"id": "ticket-1"} as Record<string, unknown>],
  ["tickets.update", "PUT", "/tickets/ticket-1", {"id": "ticket-1", "open": true, "ticketStateId": "state-1"} as Record<string, unknown>],
  ["tickets.delete", "DELETE", "/tickets/ticket-1", {"id": "ticket-1"} as Record<string, unknown>],
  ["tickets.enqueue", "POST", "/tickets/enqueue", {"ticketTypeId": "36", "contacts": [{"id": "contact-1"}], "ticketAttributes": {"_default_title_": "Queued bug"}} as Record<string, unknown>],
  ["tickets.tag", "POST", "/tickets/ticket-1/tags", {"id": "ticket-1", "tagId": "tag-1", "adminId": "991"} as Record<string, unknown>],
  ["tickets.untag", "DELETE", "/tickets/ticket-1/tags/tag-1", {"id": "ticket-1", "tagId": "tag-1", "adminId": "991"} as Record<string, unknown>],
  ["ticketTypes.list", "GET", "/ticket_types", {} as Record<string, unknown>],
  ["ticketTypes.create", "POST", "/ticket_types", {"name": "Bug", "category": "customer", "description": "Product bugs"} as Record<string, unknown>],
  ["ticketTypes.get", "GET", "/ticket_types/36", {"id": "36"} as Record<string, unknown>],
  ["ticketTypes.update", "PUT", "/ticket_types/36", {"id": "36", "name": "Bug report"} as Record<string, unknown>],
  ["ticketTypes.attributes.create", "POST", "/ticket_types/36/attributes", {"id": "36", "name": "Severity", "description": "Bug severity", "dataType": "string"} as Record<string, unknown>],
  ["ticketTypes.attributes.update", "PUT", "/ticket_types/36/attributes/attr-1", {"id": "36", "attributeId": "attr-1", "name": "Impact"} as Record<string, unknown>],
  ["ticketStates.list", "GET", "/ticket_states", {} as Record<string, unknown>],
  ["tags.get", "GET", "/tags/tag-1", {"id": "tag-1"} as Record<string, unknown>],
  ["tags.delete", "DELETE", "/tags/tag-1", {"id": "tag-1"} as Record<string, unknown>],
  ["admins.me", "GET", "/me", {} as Record<string, unknown>],
  ["admins.setAway", "PUT", "/admins/991/away", {"id": "991", "awayModeEnabled": true, "awayModeReassign": false} as Record<string, unknown>],
  ["admins.activityLogs", "GET", "/admins/activity_logs", {"createdAtAfter": "1710000000", "createdAtBefore": "1710086400"} as Record<string, unknown>],
  ["teams.list", "GET", "/teams", {} as Record<string, unknown>],
  ["teams.get", "GET", "/teams/5017691", {"id": "5017691"} as Record<string, unknown>],
  ["articles.list", "GET", "/articles", {"page": 1, "perPage": 20} as Record<string, unknown>],
  ["articles.create", "POST", "/articles", {"title": "Reset password", "authorId": 991, "body": "<p>Click forgot password.</p>", "state": "published"} as Record<string, unknown>],
  ["articles.get", "GET", "/articles/art-1", {"id": "art-1"} as Record<string, unknown>],
  ["articles.update", "PUT", "/articles/art-1", {"id": "art-1", "title": "Reset your password", "state": "published"} as Record<string, unknown>],
  ["articles.delete", "DELETE", "/articles/art-1", {"id": "art-1"} as Record<string, unknown>],
  ["articles.search", "GET", "/articles/search", {"phrase": "password", "state": "published"} as Record<string, unknown>],
  ["collections.list", "GET", "/help_center/collections", {"page": 1, "perPage": 20} as Record<string, unknown>],
  ["collections.create", "POST", "/help_center/collections", {"name": "Getting started", "description": "Onboarding articles"} as Record<string, unknown>],
  ["collections.get", "GET", "/help_center/collections/col-1", {"id": "col-1"} as Record<string, unknown>],
  ["collections.update", "PUT", "/help_center/collections/col-1", {"id": "col-1", "name": "Onboarding"} as Record<string, unknown>],
  ["collections.delete", "DELETE", "/help_center/collections/col-1", {"id": "col-1"} as Record<string, unknown>],
  ["helpCenters.list", "GET", "/help_center/help_centers", {} as Record<string, unknown>],
  ["helpCenters.get", "GET", "/help_center/help_centers/hc-1", {"id": "hc-1"} as Record<string, unknown>],
  ["sections.list", "GET", "/help_center/sections", {"perPage": 20} as Record<string, unknown>],
  ["sections.create", "POST", "/help_center/sections", {"name": "Billing", "parentId": "col-1"} as Record<string, unknown>],
  ["internalArticles.list", "GET", "/internal_articles", {"perPage": 20} as Record<string, unknown>],
  ["internalArticles.create", "POST", "/internal_articles", {"title": "Escalation policy", "ownerId": 991, "authorId": 991, "body": "<p>Page the on-call.</p>"} as Record<string, unknown>],
  ["internalArticles.get", "GET", "/internal_articles/ia-1", {"id": "ia-1"} as Record<string, unknown>],
  ["internalArticles.update", "PUT", "/internal_articles/ia-1", {"id": "ia-1", "title": "Escalation", "body": "<p>Updated.</p>", "ownerId": 991, "authorId": 991} as Record<string, unknown>],
  ["internalArticles.delete", "DELETE", "/internal_articles/ia-1", {"id": "ia-1"} as Record<string, unknown>],
  ["internalArticles.search", "GET", "/internal_articles/search", {"perPage": 20, "folderId": "folder-1"} as Record<string, unknown>],
  ["dataAttributes.list", "GET", "/data_attributes", {"model": "contact"} as Record<string, unknown>],
  ["dataAttributes.create", "POST", "/data_attributes", {"name": "plan", "model": "contact", "dataType": "string", "description": "Billing plan"} as Record<string, unknown>],
  ["dataAttributes.update", "PUT", "/data_attributes/da-1", {"id": "da-1", "description": "Updated plan field"} as Record<string, unknown>],
  ["dataEvents.create", "POST", "/events", {"eventName": "invited-friend", "createdAt": 1710000000, "email": "ada@example.com"} as Record<string, unknown>],
  ["dataEvents.list", "GET", "/events", {"email": "ada@example.com"} as Record<string, unknown>],
  ["dataEvents.summaries", "POST", "/events/summaries", {"userId": "ada-1", "eventSummaries": {"event_name": "invited-friend", "count": 3, "first": 1710000000, "last": 1710086400}} as Record<string, unknown>],
  ["dataExport.create", "POST", "/export/content/data", {"createdAtAfter": 1710000000, "createdAtBefore": 1710086400} as Record<string, unknown>],
  ["dataExport.get", "GET", "/export/content/data/job-exp-1", {"jobIdentifier": "job-exp-1"} as Record<string, unknown>],
  ["dataExport.cancel", "POST", "/export/cancel/job-exp-1", {"jobIdentifier": "job-exp-1"} as Record<string, unknown>],
  ["dataExport.download", "GET", "/download/content/data/job-exp-1", {"jobIdentifier": "job-exp-1"} as Record<string, unknown>],
  ["contentImportSources.list", "GET", "/ai/content_import_sources", {"perPage": 20} as Record<string, unknown>],
  ["contentImportSources.create", "POST", "/ai/content_import_sources", {"url": "https://docs.example.com", "syncBehavior": "api"} as Record<string, unknown>],
  ["contentImportSources.get", "GET", "/ai/content_import_sources/src-1", {"id": "src-1"} as Record<string, unknown>],
  ["contentImportSources.update", "PUT", "/ai/content_import_sources/src-1", {"id": "src-1", "url": "https://docs.example.com/v2", "syncBehavior": "automatic"} as Record<string, unknown>],
  ["contentImportSources.delete", "DELETE", "/ai/content_import_sources/src-1", {"id": "src-1"} as Record<string, unknown>],
  ["externalPages.list", "GET", "/ai/external_pages", {"perPage": 20} as Record<string, unknown>],
  ["externalPages.create", "POST", "/ai/external_pages", {"url": "https://example.com/pricing", "html": "<p>Plans</p>", "title": "Pricing", "locale": "en", "sourceId": "src-1", "externalId": "pricing"} as Record<string, unknown>],
  ["externalPages.get", "GET", "/ai/external_pages/page-1", {"id": "page-1"} as Record<string, unknown>],
  ["externalPages.update", "PUT", "/ai/external_pages/page-1", {"id": "page-1", "url": "https://example.com/pricing", "html": "<p>New plans</p>", "title": "Pricing", "locale": "en", "sourceId": "src-1", "externalId": "pricing", "finAvailability": true} as Record<string, unknown>],
  ["externalPages.delete", "DELETE", "/ai/external_pages/page-1", {"id": "page-1"} as Record<string, unknown>],
  ["visitors.getByUserId", "GET", "/visitors", {"userId": "visitor-ext-1"} as Record<string, unknown>],
  ["visitors.delete", "DELETE", "/visitors/vis-1", {"id": "vis-1"} as Record<string, unknown>],
  ["segments.list", "GET", "/segments", {"includeCount": true} as Record<string, unknown>],
  ["segments.get", "GET", "/segments/seg-1", {"id": "seg-1", "includeCount": true} as Record<string, unknown>],
  ["subscriptionTypes.list", "GET", "/subscription_types", {} as Record<string, unknown>],
  ["newsItems.list", "GET", "/news/news_items", {} as Record<string, unknown>],
  ["counts.get", "GET", "/counts", {"type": "conversation"} as Record<string, unknown>],
  ["jobs.get", "GET", "/jobs/status/job-1", {"id": "job-1"} as Record<string, unknown>],
  ["macros.list", "GET", "/macros", {"perPage": 20} as Record<string, unknown>],
  ["macros.get", "GET", "/macros/macro-1", {"id": "macro-1"} as Record<string, unknown>],
  ["awayStatusReasons.list", "GET", "/away_status_reasons", {} as Record<string, unknown>],
  ["calls.list", "GET", "/calls", {"page": 1, "perPage": 25} as Record<string, unknown>],
  ["calls.get", "GET", "/calls/call-1", {"id": "call-1"} as Record<string, unknown>],
  ["calls.transcript", "GET", "/calls/call-1/transcript", {"id": "call-1"} as Record<string, unknown>],
  ["calls.search", "POST", "/calls/search", {"conversationIds": ["147"]} as Record<string, unknown>],
  ["finVoice.register", "POST", "/fin_voice/register", {"callId": "ext-call-1", "phoneNumber": "+15551234567", "source": "zoom_phone"} as Record<string, unknown>],
  ["customObjectInstances.getByExternalId", "GET", "/custom_object_instances/Order", {"customObjectTypeIdentifier": "Order", "externalId": "ord-1"} as Record<string, unknown>],
  ["conversations.snooze", "POST", "/conversations/147/parts", {"id": "147", "adminId": "991", "snoozedUntil": 1710086400} as Record<string, unknown>],
  ["conversations.update", "PUT", "/conversations/147", {"id": "147", "read": true, "title": "Billing follow-up"} as Record<string, unknown>],
  ["conversations.delete", "DELETE", "/conversations/147", {"id": "147"} as Record<string, unknown>],
  ["conversations.convert", "POST", "/conversations/147/convert", {"id": "147", "ticketTypeId": "36"} as Record<string, unknown>],
  ["conversations.redact", "POST", "/conversations/redact", {"type": "conversation_part", "conversationId": "147", "conversationPartId": "part-1"} as Record<string, unknown>],
  ["messages.create", "POST", "/messages", {"body": "Hello from Support.", "fromType": "admin", "fromId": "991", "toType": "user", "toId": "contact-1", "messageType": "in_app"} as Record<string, unknown>],
  ["newsItems.create", "POST", "/news/news_items", {"title": "New billing portal", "body": "<p>Pay invoices online.</p>", "senderId": 991, "state": "draft"} as Record<string, unknown>],
  ["newsItems.get", "GET", "/news/news_items/news-1", {"id": "news-1"} as Record<string, unknown>],
  ["newsItems.update", "PUT", "/news/news_items/news-1", {"id": "news-1", "title": "Billing portal is live", "state": "live"} as Record<string, unknown>],
  ["newsItems.delete", "DELETE", "/news/news_items/news-1", {"id": "news-1"} as Record<string, unknown>],
  ["newsfeeds.list", "GET", "/news/newsfeeds", {} as Record<string, unknown>],
  ["newsfeeds.get", "GET", "/news/newsfeeds/feed-1", {"id": "feed-1"} as Record<string, unknown>],
  ["newsfeeds.listItems", "GET", "/news/newsfeeds/feed-1/items", {"id": "feed-1"} as Record<string, unknown>],
  ["visitors.update", "PUT", "/visitors", {"id": "vis-1", "name": "Ada Visitor"} as Record<string, unknown>],
  ["visitors.convert", "POST", "/visitors/convert", {"type": "user", "visitor": {"user_id": "visitor-ext-1"}, "user": {"email": "ada@example.com"}} as Record<string, unknown>],
  ["customObjectInstances.create", "POST", "/custom_object_instances/Order", {"customObjectTypeIdentifier": "Order", "externalId": "ord-1", "customAttributes": {"amount": 42}} as Record<string, unknown>],
  ["customObjectInstances.deleteByExternalId", "DELETE", "/custom_object_instances/Order", {"customObjectTypeIdentifier": "Order", "externalId": "ord-1"} as Record<string, unknown>],
  ["customObjectInstances.get", "GET", "/custom_object_instances/Order/coi-1", {"customObjectTypeIdentifier": "Order", "id": "coi-1"} as Record<string, unknown>],
  ["customObjectInstances.delete", "DELETE", "/custom_object_instances/Order/coi-1", {"customObjectTypeIdentifier": "Order", "id": "coi-1"} as Record<string, unknown>],
  ["phoneCallRedirects.create", "POST", "/phone_call_redirects", {"phone": "+15551234567", "customAttributes": {"issue_type": "Billing"}} as Record<string, unknown>],
  ["contacts.listTickets", "GET", "/contacts/contact-1/tickets", {"id": "contact-1", "perPage": 20} as Record<string, unknown>],
  ["sections.get", "GET", "/help_center/sections/sec-1", {"id": "sec-1"} as Record<string, unknown>],
  ["sections.update", "PUT", "/help_center/sections/sec-1", {"id": "sec-1", "name": "Invoices"} as Record<string, unknown>],
  ["sections.delete", "DELETE", "/help_center/sections/sec-1", {"id": "sec-1"} as Record<string, unknown>],
] as const;

describe("intercom deepened operations", () => {
  it("keeps the original 24 operations", () => {
    for (const key of ORIGINAL) {
      expect(manifest.operations[key], key).toBeDefined();
      expect(actions[key], key).toBeTypeOf("function");
    }
  });

  it("compiles every action with a real request block", () => {
    const operations = manifest.operations as Record<string, { request?: { method?: string; path?: string }; title?: string; description?: string; inputSchema?: { type?: string }; sideEffect?: string }>;
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.request?.method, key).toBeDefined();
      expect(String(operation.request?.path ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect(operation.inputSchema?.type, key).toBe("object");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(actions[key], key).toBeTypeOf("function");
    }
  });

  it.each(routes)("executes %s against its documented endpoint", async (key, method, path, input) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ type: "ok", id: "id-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const result = await actions[key]!({ accessToken: "token", ...input, fetch: fetchFn });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe(path);
    expect((calls[0]!.init?.method ?? "GET").toUpperCase()).toBe(method);
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer token");
    const headers = calls[0]!.init?.headers as Record<string, string>;
    const contentType = headers["Content-Type"] ?? headers["content-type"];
    const operation = manifest.operations[key] as { request?: { body?: unknown; method?: string } };
    if (operation.request?.body !== undefined) {
      expect(contentType).toBe("application/json");
      expect(calls[0]!.init?.body).toBeTruthy();
    } else {
      expect(contentType).toBeUndefined();
      expect(calls[0]!.init?.body ?? undefined).toBeUndefined();
    }
    if (["GET", "DELETE"].includes(method) && operation.request?.body === undefined) {
      expect(calls[0]!.init?.body ?? undefined).toBeUndefined();
    }
    expect(result).toMatchObject({ connector: "intercom", action: key, source: "provider" });
  });
});
