import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

const ORIGIN_OPS = [
  "healthcheck",
  "users.me.action",
  "event_types.list",
  "event_types.get",
  "scheduled_events.list",
  "scheduled_events.get",
  "scheduled_events.invitees.list",
  "scheduled_events.cancel",
  "invitees.get",
  "invitee_no_shows.create",
  "scheduling_links.create",
  "slots.available",
  "bookings.create",
  "organization.memberships.list",
  "webhook_subscriptions.create",
  "webhook_subscriptions.list",
  "webhook_subscriptions.delete",
  "users.get",
  "organizations.get",
  "routing_forms.list",
  "routing_forms.get",
  "webhook.invitee_created",
  "webhook.invitee_canceled",
  "webhook.routing_form_submission",
] as const;

const NEW_OPS = [
  "event_types.create",
  "event_types.one_off.create",
  "shares.create",
  "scheduling_links.create_single_use",
  "invitee_data.delete",
  "invitee_no_shows.delete",
  "organization.memberships.delete",
  "scheduled_event_data.delete",
  "event_types.availability.get",
  "groups.get",
  "group_relationships.get",
  "invitee_no_shows.get",
  "organization.invitations.get",
  "organization.memberships.get",
  "routing_form_submissions.get",
  "webhook_subscriptions.sample",
  "user_availability_schedules.get",
  "webhook_subscriptions.get",
  "activity_log_entries.list",
  "event_type_memberships.list",
  "group_relationships.list",
  "groups.list",
  "organization.invitations.list",
  "outgoing_communications.list",
  "routing_form_submissions.list",
  "user_availability_schedules.list",
  "user_busy_times.list",
  "user_locations.list",
  "organization.invitations.create",
  "invitees.create",
  "organization.invitations.revoke",
  "event_types.update",
  "event_types.availability.update",
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  CALENDLY_CANCEL_SCHEDULED_EVENT: "scheduled_events.cancel",
  CALENDLY_CREATE_EVENT_INVITEE: "invitees.create",
  CALENDLY_CREATE_EVENT_TYPE: "event_types.create",
  CALENDLY_CREATE_ONE_OFF_EVENT_TYPE: "event_types.one_off.create",
  CALENDLY_CREATE_SCHEDULING_LINK: "scheduling_links.create",
  CALENDLY_CREATE_SHARE: "shares.create",
  CALENDLY_CREATE_SINGLE_USE_SCHEDULING_LINK: "scheduling_links.create_single_use",
  CALENDLY_CREATE_WEBHOOKS: "webhook_subscriptions.create",
  CALENDLY_DELETE_INVITEE_DATA: "invitee_data.delete",
  CALENDLY_DELETE_INVITEE_NO_SHOW: "invitee_no_shows.delete",
  CALENDLY_DELETE_ORGANIZATION_MEMBERSHIP: "organization.memberships.delete",
  CALENDLY_DELETE_SCHEDULED_EVENT_DATA: "scheduled_event_data.delete",
  CALENDLY_DELETE_WEBHOOK_SUBSCRIPTION: "webhook_subscriptions.delete",
  CALENDLY_GET_CURRENT_USER: "users.me.action",
  CALENDLY_GET_EVENT: "scheduled_events.get",
  CALENDLY_GET_EVENT_INVITEE: "invitees.get",
  CALENDLY_GET_EVENT_TYPE: "event_types.get",
  CALENDLY_GET_EVENT_TYPE_AVAILABILITY: "event_types.availability.get",
  CALENDLY_GET_GROUP: "groups.get",
  CALENDLY_GET_GROUP_RELATIONSHIP: "group_relationships.get",
  CALENDLY_GET_INVITEE_NO_SHOW: "invitee_no_shows.get",
  CALENDLY_GET_ORGANIZATION: "organizations.get",
  CALENDLY_GET_ORGANIZATION_INVITATION: "organization.invitations.get",
  CALENDLY_GET_ORGANIZATION_MEMBERSHIP: "organization.memberships.get",
  CALENDLY_GET_ROUTING_FORM: "routing_forms.get",
  CALENDLY_GET_ROUTING_FORM_SUBMISSION: "routing_form_submissions.get",
  CALENDLY_GET_SAMPLE_WEBHOOK_DATA: "webhook_subscriptions.sample",
  CALENDLY_GET_USER: "users.get",
  CALENDLY_GET_USER_AVAILABILITY_SCHEDULE: "user_availability_schedules.get",
  CALENDLY_GET_WEBHOOK_SUBSCRIPTION: "webhook_subscriptions.get",
  CALENDLY_INVITEE_NO_SHOW: "invitee_no_shows.create",
  CALENDLY_LIST_ACTIVITY_LOG_ENTRIES: "activity_log_entries.list",
  CALENDLY_LIST_EVENT_INVITEES: "scheduled_events.invitees.list",
  CALENDLY_LIST_EVENTS: "scheduled_events.list",
  CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES: "slots.available",
  CALENDLY_LIST_EVENT_TYPE_MEMBERSHIPS: "event_type_memberships.list",
  CALENDLY_LIST_EVENT_TYPES: "event_types.list",
  CALENDLY_LIST_GROUP_RELATIONSHIPS: "group_relationships.list",
  CALENDLY_LIST_GROUPS: "groups.list",
  CALENDLY_LIST_ORGANIZATION_INVITATIONS: "organization.invitations.list",
  CALENDLY_LIST_ORGANIZATION_MEMBERSHIPS: "organization.memberships.list",
  CALENDLY_LIST_OUTGOING_COMMUNICATIONS: "outgoing_communications.list",
  CALENDLY_LIST_ROUTING_FORMS: "routing_forms.list",
  CALENDLY_LIST_ROUTING_FORM_SUBMISSIONS: "routing_form_submissions.list",
  CALENDLY_LIST_SCHEDULED_EVENTS: "scheduled_events.list",
  CALENDLY_LIST_USER_AVAILABILITY_SCHEDULES: "user_availability_schedules.list",
  CALENDLY_LIST_USER_BUSY_TIMES: "user_busy_times.list",
  CALENDLY_LIST_USER_LOCATIONS: "user_locations.list",
  CALENDLY_LIST_USER_S_EVENT_TYPES: "event_types.list",
  CALENDLY_LIST_WEBHOOK_SUBSCRIPTIONS: "webhook_subscriptions.list",
  CALENDLY_ORGANIZATION_INVITATION: "organization.invitations.create",
  CALENDLY_POST_INVITEE: "invitees.create",
  CALENDLY_REMOVE_USER_FROM_ORGANIZATION: "organization.memberships.delete",
  CALENDLY_REVOKE_USER_S_ORGANIZATION_INVITATION: "organization.invitations.revoke",
  CALENDLY_UPDATE_EVENT_TYPE: "event_types.update",
  CALENDLY_UPDATE_EVENT_TYPE_AVAILABILITY: "event_types.availability.update",
  CALENDLY_WHO_AM_I: "users.me.action",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      input[key] = items.type === "object" ? [{ type: "wday" }] : ["a@example.com"];
    } else if (prop.type === "object") {
      if (key === "invitee") input[key] = { email: "a@example.com", timezone: "America/New_York" };
      else if (key === "availability_rule") input[key] = { timezone: "America/New_York" };
      else if (key === "date_setting") input[key] = { type: "days_in_future", days: 7, only_weekdays: false };
      else input[key] = { kind: "custom" };
    } else input[key] = key.includes("uuid") || key === "uuid" ? "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" : `https://api.calendly.com/${key}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`;
  }
  return input;
}

describe("calendly depth manifest", () => {
  test("keeps origin auth, host, and version 0.3.1", () => {
    expect(manifest.key).toBe("calendly");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("external_bearer");
    expect(manifest.network.allowedHosts).toEqual(["api.calendly.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.calendly.com");
    expect(manifest.http.auth.field).toBe("accessToken");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin 24 operations", () => {
    expect(ORIGIN_OPS).toHaveLength(24);
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
    }
  });

  test("covers every Composio Calendly tool", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(57);
    expect(Object.keys(operations).length).toBe(57);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
    }
  });

  test("adds 33 real request-block operations", () => {
    expect(NEW_OPS).toHaveLength(33);
    for (const key of NEW_OPS) {
      const operation = operations[key];
      expect(operation, key).toBeDefined();
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
      expect(compiled.actions[key], key).toBeTypeOf("function");
    }
  });

  test("webhook sideEffect stays read", () => {
    for (const key of ["webhook.invitee_created", "webhook.invitee_canceled", "webhook.routing_form_submission"]) {
      expect(operations[key]!.kind).toBe("webhook");
      expect(operations[key]!.sideEffect).toBe("read");
      expect(operations[key]!.request).toBeUndefined();
    }
  });

  test("classifies new mutating methods as write or destructive", () => {
    for (const key of NEW_OPS) {
      const method = String(requestOf(key).method);
      if (method === "DELETE" || key.endsWith(".delete")) expect(operations[key]!.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operations[key]!.sideEffect, key).toBe("write");
      else expect(operations[key]!.sideEffect, key).toBe("read");
    }
  });

  test("maps official Calendly paths", () => {
    expect(requestOf("event_types.create")).toMatchObject({ method: "POST", path: "/event_types" });
    expect(requestOf("event_types.one_off.create")).toMatchObject({ method: "POST", path: "/one_off_event_types" });
    expect(requestOf("shares.create")).toMatchObject({ method: "POST", path: "/shares" });
    expect(requestOf("scheduling_links.create_single_use")).toMatchObject({ method: "POST", path: "/scheduling_links" });
    expect(requestOf("invitee_data.delete")).toMatchObject({ method: "POST", path: "/data_compliance/deletion/invitees" });
    expect(requestOf("invitee_no_shows.delete").path).toBe("/invitee_no_shows/{{uuid}}");
    expect(requestOf("organization.memberships.delete").path).toBe("/organization_memberships/{{uuid}}");
    expect(requestOf("scheduled_event_data.delete").path).toBe("/data_compliance/deletion/events");
    expect(requestOf("event_types.availability.get").path).toBe("/event_type_availability_schedules");
    expect(requestOf("groups.get").path).toBe("/groups/{{uuid}}");
    expect(requestOf("routing_form_submissions.list").path).toBe("/routing_form_submissions");
    expect((requestOf("routing_form_submissions.list").query as Record<string, string>).form).toBe("{{form}}");
    expect(requestOf("event_types.availability.update")).toMatchObject({ method: "PATCH", path: "/event_type_availability_schedules" });
    expect((requestOf("event_types.availability.update").query as Record<string, string>).event_type).toBe("{{event_type}}");
    expect(requestOf("invitees.create")).toMatchObject({ method: "POST", path: "/invitees" });
    expect(requestOf("user_locations.list").path).toBe("/locations");
    expect(requestOf("webhook_subscriptions.sample").path).toBe("/sample_webhook_data");
    expect(requestOf("organization.invitations.create").path).toBe("/organizations/{{org_uuid}}/invitations");
    expect(requestOf("organization.invitations.revoke").method).toBe("DELETE");
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const key of NEW_OPS) {
      const request = requestOf(key);
      const schema = operations[key]!.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../recipes/calendly/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(recipe.manifest.http.auth.field).toBe("apiKey");
  });
});

describe("calendly compiled new handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      accessToken: "tok_test",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every new operation dispatches a real HTTP request", async () => {
    for (const key of NEW_OPS) {
      const request = requestOf(key) as { method: string; path: string; success?: number[] };
      const input = dummyInput(operations[key]!.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const success = request.success ?? [200, 201, 202, 204];
      const { requests, result } = await invoke(key, input, (req) => {
        const status = success.includes(204) && req.method === "DELETE" ? 204 : success.includes(202) ? 202 : success.includes(201) ? 201 : 200;
        if (status === 204) return new Response(null, { status });
        return jsonResponse({ resource: { uri: "https://api.calendly.com/ok" } }, status);
      });
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.calendly.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer tok_test");
      expect(result).toMatchObject({ connector: "calendly", action: key, source: "provider" });
    }
  });

  test("invitees.create posts official booking body", async () => {
    const { requests, result } = await invoke(
      "invitees.create",
      {
        event_type: "https://api.calendly.com/event_types/et1",
        start_time: "2026-10-02T18:30:00Z",
        invitee: { email: "jordan@example.com", timezone: "America/New_York", name: "Jordan Lee" },
        event_guests: ["alex@example.com"],
      },
      () => jsonResponse({ resource: { email: "jordan@example.com" } }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/invitees");
    expect(await requests[0]!.json()).toEqual({
      event_type: "https://api.calendly.com/event_types/et1",
      start_time: "2026-10-02T18:30:00Z",
      invitee: { email: "jordan@example.com", timezone: "America/New_York", name: "Jordan Lee" },
      event_guests: ["alex@example.com"],
    });
    expect(result).toMatchObject({ source: "provider", data: { resource: { email: "jordan@example.com" } } });
  });

  test("event_types.availability.update patches collection URL with event_type query", async () => {
    const { requests } = await invoke(
      "event_types.availability.update",
      {
        event_type: "https://api.calendly.com/event_types/et1",
        availability_rule: { timezone: "America/Chicago" },
      },
      () => jsonResponse({ resource: { availability_setting: "host" } }),
    );
    const url = new URL(requests[0]!.url);
    expect(requests[0]!.method).toBe("PATCH");
    expect(url.pathname).toBe("/event_type_availability_schedules");
    expect(url.searchParams.get("event_type")).toBe("https://api.calendly.com/event_types/et1");
    expect(await requests[0]!.json()).toEqual({ availability_rule: { timezone: "America/Chicago" } });
  });

  test("routing_form_submissions.list queries form=", async () => {
    const { requests } = await invoke(
      "routing_form_submissions.list",
      { form: "https://api.calendly.com/routing_forms/rf1" },
      () => jsonResponse({ collection: [] }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/routing_form_submissions");
    expect(url.searchParams.get("form")).toBe("https://api.calendly.com/routing_forms/rf1");
  });

  test("scheduling_links.create_single_use forces max_event_count 1", async () => {
    const { requests } = await invoke(
      "scheduling_links.create_single_use",
      { owner: "https://api.calendly.com/event_types/et1", owner_type: "EventType" },
      () => jsonResponse({ resource: { booking_url: "https://calendly.com/x" } }, 201),
    );
    expect(await requests[0]!.json()).toEqual({
      max_event_count: 1,
      owner: "https://api.calendly.com/event_types/et1",
      owner_type: "EventType",
    });
  });

  test("invitee_no_shows.delete returns the static envelope on 204", async () => {
    const { requests, result } = await invoke(
      "invitee_no_shows.delete",
      { uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
      () => new Response(null, { status: 204 }),
    );
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/invitee_no_shows/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(result).toEqual({
      connector: "calendly",
      action: "invitee_no_shows.delete",
      source: "provider",
      success: true,
    });
  });
});
