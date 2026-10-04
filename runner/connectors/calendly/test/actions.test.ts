import { describe, expect, test } from "bun:test";
import usersMeFixture from "../fixtures/users_me_action.json";
import eventTypesFixture from "../fixtures/event_types_list.json";
import scheduledEventsListFixture from "../fixtures/scheduled_events_list.json";
import scheduledEventGetFixture from "../fixtures/scheduled_event_get.json";
import inviteesListFixture from "../fixtures/invitees_list.json";
import eventCancelFixture from "../fixtures/event_cancel.json";
import inviteeNoShowFixture from "../fixtures/invitee_no_show.json";
import schedulingLinkFixture from "../fixtures/scheduling_link.json";
import availableTimesFixture from "../fixtures/available_times.json";
import scheduledEventCreateFixture from "../fixtures/scheduled_event_create.json";
import eventTypeGetFixture from "../fixtures/event_type_get.json";
import inviteeGetFixture from "../fixtures/invitee_get.json";
import organizationMembershipsFixture from "../fixtures/organization_memberships.json";
import webhookSubscriptionFixture from "../fixtures/webhook_subscription.json";
import webhookSubscriptionsFixture from "../fixtures/webhook_subscriptions.json";
import userGetFixture from "../fixtures/user_get.json";
import organizationGetFixture from "../fixtures/organization_get.json";
import routingFormsFixture from "../fixtures/routing_forms.json";
import routingFormFixture from "../fixtures/routing_form.json";

import {
  getUsersMe,
  listEventTypes,
  listScheduledEvents,
  getScheduledEvent,
  listInvitees,
  cancelScheduledEvent,
  createInviteeNoShow,
  createSchedulingLink,
  getAvailableSlots,
  createBooking,
  getEventType,
  getInvitee,
  listOrganizationMemberships,
  createWebhookSubscription,
  listWebhookSubscriptions,
  deleteWebhookSubscription,
  getUser,
  getOrganization,
  listRoutingForms,
  getRoutingForm,
  validateUsersMeInput,
  validateEventTypesListInput,
  validateScheduledEventsListInput,
  validateScheduledEventsGetInput,
  validateInviteesListInput,
  validateScheduledEventsCancelInput,
  validateInviteeNoShowCreateInput,
  validateSchedulingLinkCreateInput,
  validateSlotsAvailableInput,
  validateBookingsCreateInput,
  validateEventTypesGetInput,
  validateInviteesGetInput,
  validateOrganizationMembershipsListInput,
  validateWebhookSubscriptionsCreateInput,
  validateWebhookSubscriptionsListInput,
  validateWebhookSubscriptionsDeleteInput,
  validateUsersGetInput,
  validateOrganizationsGetInput,
  validateRoutingFormsListInput,
  validateRoutingFormsGetInput,
} from "../src/actions";

// ─── users.me.action ──────────────────────────────────────────────────────────

describe("getUsersMe", () => {
  test("validates input and returns connector-owned output", () => {
    const result = getUsersMe({});
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("calendly");
    expect(result.action).toBe("users.me.action");
    expect(result.validated).toEqual({});
  });

  test("calls GET /users/me with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getUsersMe({
      accessToken: "tok_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(usersMeFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.calendly.com/users/me");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.connector).toBe("calendly");
    expect(result.action).toBe("users.me.action");
    expect(result.source).toBe("connector");
    expect(result.user).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getUsersMe({
      accessToken: "tok_test",
      fetch: async () => new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        headers: { "retry-after": "30" },
      }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps non-200 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getUsersMe({
      accessToken: "tok_test",
      fetch: async () => new Response(JSON.stringify({ message: "server error" }), { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── event_types.list ─────────────────────────────────────────────────────────

describe("listEventTypes", () => {
  test("validates input and returns validated output", () => {
    const result = listEventTypes({ user: "https://api.calendly.com/users/usr_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("event_types.list");
    expect((result.validated as { user: string }).user).toBe("https://api.calendly.com/users/usr_001");
  });

  test("throws when user is missing", () => {
    expect(() => validateEventTypesListInput({})).toThrow("user is required");
  });

  test("calls GET /event_types with correct query params and Bearer token", async () => {
    const requests: Request[] = [];
    const result = await listEventTypes({
      accessToken: "tok_test",
      user: "https://api.calendly.com/users/usr_001",
      active: true,
      count: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(eventTypesFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/event_types");
    expect(url.searchParams.get("user")).toBe("https://api.calendly.com/users/usr_001");
    expect(url.searchParams.get("active")).toBe("true");
    expect(url.searchParams.get("count")).toBe("10");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("event_types.list");
    expect(Array.isArray(result.eventTypes)).toBe(true);
    expect((result.eventTypes as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listEventTypes({
      accessToken: "tok_test",
      user: "https://api.calendly.com/users/usr_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });
});

// ─── scheduled_events.list ────────────────────────────────────────────────────

describe("listScheduledEvents", () => {
  test("validates input and returns connector-owned output", () => {
    const result = listScheduledEvents({ user: "https://api.calendly.com/users/usr_001", status: "active" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("scheduled_events.list");
    expect((result.validated as { status: string }).status).toBe("active");
  });

  test("calls GET /scheduled_events with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await listScheduledEvents({
      accessToken: "tok_test",
      user: "https://api.calendly.com/users/usr_001",
      status: "active",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(scheduledEventsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/scheduled_events");
    expect(url.searchParams.get("status")).toBe("active");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("scheduled_events.list");
    expect(Array.isArray(result.events)).toBe(true);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listScheduledEvents({
      accessToken: "tok_test",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── scheduled_events.get ─────────────────────────────────────────────────────

describe("getScheduledEvent", () => {
  test("validates input and returns connector-owned output", () => {
    const result = getScheduledEvent({ uuid: "evt_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("scheduled_events.get");
    expect((result.validated as { uuid: string }).uuid).toBe("evt_001");
  });

  test("throws when uuid is missing", () => {
    expect(() => validateScheduledEventsGetInput({})).toThrow("uuid is required");
  });

  test("calls GET /scheduled_events/{uuid} with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getScheduledEvent({
      accessToken: "tok_test",
      uuid: "evt_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(scheduledEventGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.calendly.com/scheduled_events/evt_001");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("scheduled_events.get");
    expect(result.event).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getScheduledEvent({
      accessToken: "tok_test",
      uuid: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getScheduledEvent({
      accessToken: "tok_test",
      uuid: "evt_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

// ─── scheduled_events.invitees.list ───────────────────────────────────────────

describe("listInvitees", () => {
  test("validates input and returns connector-owned output", () => {
    const result = listInvitees({ uuid: "evt_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("scheduled_events.invitees.list");
    expect((result.validated as { uuid: string }).uuid).toBe("evt_001");
  });

  test("throws when uuid is missing", () => {
    expect(() => validateInviteesListInput({})).toThrow("uuid is required");
  });

  test("calls GET /scheduled_events/{uuid}/invitees with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await listInvitees({
      accessToken: "tok_test",
      uuid: "evt_001",
      status: "active",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(inviteesListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/scheduled_events/evt_001/invitees");
    expect(url.searchParams.get("status")).toBe("active");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("scheduled_events.invitees.list");
    expect(Array.isArray(result.invitees)).toBe(true);
    expect((result.invitees as unknown[]).length).toBe(1);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listInvitees({
      accessToken: "tok_test",
      uuid: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listInvitees({
      accessToken: "tok_test",
      uuid: "evt_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── scheduled_events.cancel ──────────────────────────────────────────────────

describe("cancelScheduledEvent", () => {
  test("validates input and returns connector-owned output", () => {
    const result = cancelScheduledEvent({ uuid: "evt_001", reason: "Conflict" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("scheduled_events.cancel");
    expect((result.validated as { uuid: string; reason: string }).uuid).toBe("evt_001");
    expect((result.validated as { uuid: string; reason: string }).reason).toBe("Conflict");
  });

  test("throws when uuid is missing", () => {
    expect(() => validateScheduledEventsCancelInput({})).toThrow("uuid is required");
  });

  test("calls POST /scheduled_events/{uuid}/cancellation with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await cancelScheduledEvent({
      accessToken: "tok_test",
      uuid: "evt_001",
      reason: "Scheduling conflict",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(eventCancelFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.calendly.com/scheduled_events/evt_001/cancellation");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("scheduled_events.cancel");
    expect(result.cancellation).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(cancelScheduledEvent({
      accessToken: "tok_test",
      uuid: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(cancelScheduledEvent({
      accessToken: "tok_test",
      uuid: "evt_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

// ─── invitee_no_shows.create ──────────────────────────────────────────────────

describe("createInviteeNoShow", () => {
  test("validates input and returns connector-owned output", () => {
    const inviteeUri = "https://api.calendly.com/scheduled_events/evt_001/invitees/inv_001";
    const result = createInviteeNoShow({ invitee: inviteeUri });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("invitee_no_shows.create");
    expect((result.validated as { invitee: string }).invitee).toBe(inviteeUri);
  });

  test("throws when invitee is missing", () => {
    expect(() => validateInviteeNoShowCreateInput({})).toThrow("invitee is required");
  });

  test("calls POST /invitee_no_shows with Bearer token", async () => {
    const requests: Request[] = [];
    const inviteeUri = "https://api.calendly.com/scheduled_events/evt_001/invitees/inv_001";
    const result = await createInviteeNoShow({
      accessToken: "tok_test",
      invitee: inviteeUri,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(inviteeNoShowFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.calendly.com/invitee_no_shows");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.invitee).toBe(inviteeUri);
    expect(result.action).toBe("invitee_no_shows.create");
    expect(result.noShow).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createInviteeNoShow({
      accessToken: "tok_test",
      invitee: "https://api.calendly.com/scheduled_events/nonexistent/invitees/inv_001",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createInviteeNoShow({
      accessToken: "tok_test",
      invitee: "https://api.calendly.com/scheduled_events/evt_001/invitees/inv_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "25" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 25 });
  });
});

// ─── scheduling_links.create ──────────────────────────────────────────────────

describe("createSchedulingLink", () => {
  test("validates input and returns connector-owned output", () => {
    const result = createSchedulingLink({
      owner: "https://api.calendly.com/event_types/et_001",
      ownerType: "EventType",
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("scheduling_links.create");
    expect((result.validated as { ownerType: string }).ownerType).toBe("EventType");
  });

  test("throws when owner is missing", () => {
    expect(() => validateSchedulingLinkCreateInput({ ownerType: "EventType" })).toThrow("owner is required");
  });

  test("throws when ownerType is missing", () => {
    expect(() => validateSchedulingLinkCreateInput({ owner: "https://api.calendly.com/event_types/et_001" })).toThrow("ownerType is required");
  });

  test("calls POST /scheduling_links with Bearer token and correct body", async () => {
    const requests: Request[] = [];
    const result = await createSchedulingLink({
      accessToken: "tok_test",
      owner: "https://api.calendly.com/event_types/et_001",
      ownerType: "EventType",
      maxEventCount: 1,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(schedulingLinkFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.calendly.com/scheduling_links");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.owner).toBe("https://api.calendly.com/event_types/et_001");
    expect(body.owner_type).toBe("EventType");
    expect(body.max_event_count).toBe(1);
    expect(result.action).toBe("scheduling_links.create");
    expect(result.link).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createSchedulingLink({
      accessToken: "tok_test",
      owner: "https://api.calendly.com/event_types/et_001",
      ownerType: "EventType",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "40" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 40 });
  });

  test("maps non-201 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createSchedulingLink({
      accessToken: "tok_test",
      owner: "https://api.calendly.com/event_types/et_001",
      ownerType: "EventType",
      fetch: async () => new Response("{}", { status: 400 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── slots.available ──────────────────────────────────────────────────────────

describe("getAvailableSlots", () => {
  test("validates input and returns connector-owned output", () => {
    const result = getAvailableSlots({
      eventType: "https://api.calendly.com/event_types/AAAA",
      start: "2026-06-10T00:00:00Z",
      end: "2026-06-12T00:00:00Z",
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("slots.available");
    expect((result.validated as { eventType: string }).eventType).toBe("https://api.calendly.com/event_types/AAAA");
  });

  test("throws when eventType is missing", () => {
    expect(() => validateSlotsAvailableInput({ start: "2026-06-10T00:00:00Z", end: "2026-06-12T00:00:00Z" }))
      .toThrow("eventType is required");
  });

  test("throws when window exceeds 7 days", () => {
    expect(() => validateSlotsAvailableInput({
      eventType: "https://api.calendly.com/event_types/AAAA",
      start: "2026-06-10T00:00:00Z",
      end: "2026-06-20T00:00:00Z",
    })).toThrow("start and end must span at most 7 days");
  });

  test("calls GET /event_type_available_times with query params", async () => {
    const requests: Request[] = [];
    const result = await getAvailableSlots({
      accessToken: "tok_test",
      eventType: "https://api.calendly.com/event_types/AAAA",
      start: "2026-06-10T00:00:00Z",
      end: "2026-06-12T00:00:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(availableTimesFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/event_type_available_times");
    expect(url.searchParams.get("event_type")).toBe("https://api.calendly.com/event_types/AAAA");
    expect(url.searchParams.get("start_time")).toBe("2026-06-10T00:00:00Z");
    expect(url.searchParams.get("end_time")).toBe("2026-06-12T00:00:00Z");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("slots.available");
    expect(Array.isArray(result.slots)).toBe(true);
    expect((result.slots as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getAvailableSlots({
      accessToken: "tok",
      eventType: "https://api.calendly.com/event_types/AAAA",
      start: "2026-06-10T00:00:00Z",
      end: "2026-06-12T00:00:00Z",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});

// ─── bookings.create ──────────────────────────────────────────────────────────

describe("createBooking", () => {
  test("validates input and returns connector-owned output", () => {
    const result = createBooking({
      eventType: "https://api.calendly.com/event_types/AAAA",
      startTime: "2026-06-10T15:00:00Z",
      invitee: { name: "Carol White", email: "carol@example.com", timeZone: "America/New_York" },
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bookings.create");
    const v = result.validated as { eventType: string; startTime: string };
    expect(v.eventType).toBe("https://api.calendly.com/event_types/AAAA");
    expect(v.startTime).toBe("2026-06-10T15:00:00Z");
  });

  test("throws when invitee is missing", () => {
    expect(() => validateBookingsCreateInput({
      eventType: "https://api.calendly.com/event_types/AAAA",
      startTime: "2026-06-10T15:00:00Z",
    })).toThrow("invitee is required");
  });

  test("throws when startTime is missing", () => {
    expect(() => validateBookingsCreateInput({
      eventType: "https://api.calendly.com/event_types/AAAA",
      invitee: { name: "A", email: "a@a.com", timeZone: "UTC" },
    })).toThrow("startTime is required");
  });

  test("calls POST /scheduled_events with mapped body", async () => {
    const requests: Request[] = [];
    const result = await createBooking({
      accessToken: "tok_test",
      eventType: "https://api.calendly.com/event_types/AAAA",
      startTime: "2026-06-10T15:00:00Z",
      invitee: { name: "Carol White", email: "carol@example.com", timeZone: "America/New_York" },
      guests: ["guest@example.com"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(scheduledEventCreateFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.calendly.com/scheduled_events");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, any>;
    expect(body.event_type).toBe("https://api.calendly.com/event_types/AAAA");
    expect(body.start_time).toBe("2026-06-10T15:00:00Z");
    expect(body.invitee).toEqual({ name: "Carol White", email: "carol@example.com", timezone: "America/New_York" });
    expect(body.event_guests).toEqual(["guest@example.com"]);
    expect(result.action).toBe("bookings.create");
    expect(result.booking).toBeDefined();
  });

  test("rejects non-string guests", () => {
    expect(() => validateBookingsCreateInput({
      eventType: "https://api.calendly.com/event_types/AAAA",
      startTime: "2026-06-10T15:00:00Z",
      invitee: { name: "A", email: "a@a.com", timeZone: "UTC" },
      guests: [42],
    })).toThrow("guests must be an array of email strings");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createBooking({
      accessToken: "tok",
      eventType: "https://api.calendly.com/event_types/AAAA",
      startTime: "2026-06-10T15:00:00Z",
      invitee: { name: "A", email: "a@a.com", timeZone: "UTC" },
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

describe("getEventType", () => {
  test("throws when uuid is missing", () => {
    expect(() => validateEventTypesGetInput({})).toThrow("uuid is required");
  });

  test("calls GET /event_types/{uuid}", async () => {
    const requests: Request[] = [];
    const result = await getEventType({
      accessToken: "tok_test",
      uuid: "et_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(eventTypeGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.calendly.com/event_types/et_001");
    expect(result.action).toBe("event_types.get");
    expect((result.eventType as { name: string }).name).toBe("30 Minute Meeting");
  });

  test("extracts uuid from a full event type URI", async () => {
    const requests: Request[] = [];
    await getEventType({
      accessToken: "tok_test",
      uuid: "https://api.calendly.com/event_types/et_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(eventTypeGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.calendly.com/event_types/et_001");
  });
});

describe("getInvitee", () => {
  test("requires eventUuid and uuid", () => {
    expect(() => validateInviteesGetInput({ uuid: "inv_001" })).toThrow("eventUuid is required");
    expect(() => validateInviteesGetInput({ eventUuid: "evt_001" })).toThrow("uuid is required");
  });

  test("calls GET /scheduled_events/{eventUuid}/invitees/{uuid}", async () => {
    const requests: Request[] = [];
    const result = await getInvitee({
      accessToken: "tok_test",
      eventUuid: "evt_001",
      uuid: "inv_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(inviteeGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.calendly.com/scheduled_events/evt_001/invitees/inv_001");
    expect(result.action).toBe("invitees.get");
    expect((result.invitee as { email: string }).email).toBe("bob@example.com");
  });
});

describe("listOrganizationMemberships", () => {
  test("requires organization", () => {
    expect(() => validateOrganizationMembershipsListInput({})).toThrow("organization is required");
  });

  test("calls GET /organization_memberships", async () => {
    const requests: Request[] = [];
    const result = await listOrganizationMemberships({
      accessToken: "tok_test",
      organization: "https://api.calendly.com/organizations/org_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(organizationMembershipsFixture), { status: 200 });
      },
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/organization_memberships");
    expect(url.searchParams.get("organization")).toBe("https://api.calendly.com/organizations/org_001");
    expect(result.action).toBe("organization.memberships.list");
    expect((result.memberships as unknown[]).length).toBe(1);
  });
});

describe("createWebhookSubscription", () => {
  test("requires url, events, organization, and scope", () => {
    expect(() => validateWebhookSubscriptionsCreateInput({
      events: ["invitee.created"],
      organization: "https://api.calendly.com/organizations/org_001",
      scope: "organization",
    })).toThrow("url is required");
  });

  test("POSTs to /webhook_subscriptions", async () => {
    const requests: Request[] = [];
    const result = await createWebhookSubscription({
      accessToken: "tok_test",
      url: "https://example.com/hooks/calendly",
      events: ["invitee.created", "invitee.canceled"],
      organization: "https://api.calendly.com/organizations/org_001",
      scope: "organization",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(webhookSubscriptionFixture), { status: 201 });
      },
    });
    expect(requests[0].url).toBe("https://api.calendly.com/webhook_subscriptions");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body).toMatchObject({
      url: "https://example.com/hooks/calendly",
      events: ["invitee.created", "invitee.canceled"],
      organization: "https://api.calendly.com/organizations/org_001",
      scope: "organization",
    });
    expect(result.action).toBe("webhook_subscriptions.create");
    expect(result.subscription).toBeDefined();
  });
});

describe("listWebhookSubscriptions", () => {
  test("requires organization", () => {
    expect(() => validateWebhookSubscriptionsListInput({})).toThrow("organization is required");
  });

  test("calls GET /webhook_subscriptions", async () => {
    const requests: Request[] = [];
    const result = await listWebhookSubscriptions({
      accessToken: "tok_test",
      organization: "https://api.calendly.com/organizations/org_001",
      scope: "organization",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(webhookSubscriptionsFixture), { status: 200 });
      },
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/webhook_subscriptions");
    expect(url.searchParams.get("organization")).toBe("https://api.calendly.com/organizations/org_001");
    expect(result.action).toBe("webhook_subscriptions.list");
    expect((result.subscriptions as unknown[]).length).toBe(1);
  });
});

describe("deleteWebhookSubscription", () => {
  test("requires uuid", () => {
    expect(() => validateWebhookSubscriptionsDeleteInput({})).toThrow("uuid is required");
  });

  test("DELETEs /webhook_subscriptions/{uuid}", async () => {
    const requests: Request[] = [];
    const result = await deleteWebhookSubscription({
      accessToken: "tok_test",
      uuid: "wh_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(requests[0].url).toBe("https://api.calendly.com/webhook_subscriptions/wh_001");
    expect(requests[0].method).toBe("DELETE");
    expect(result.action).toBe("webhook_subscriptions.delete");
    expect(result.deleted).toBe(true);
  });
});

describe("getUser", () => {
  test("requires uuid", () => {
    expect(() => validateUsersGetInput({})).toThrow("uuid is required");
  });

  test("calls GET /users/{uuid}", async () => {
    const requests: Request[] = [];
    const result = await getUser({
      accessToken: "tok_test",
      uuid: "usr_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(userGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.calendly.com/users/usr_001");
    expect(result.action).toBe("users.get");
    expect((result.user as { email: string }).email).toBe("jane@example.com");
  });
});

describe("getOrganization", () => {
  test("requires uuid", () => {
    expect(() => validateOrganizationsGetInput({})).toThrow("uuid is required");
  });

  test("calls GET /organizations/{uuid}", async () => {
    const requests: Request[] = [];
    const result = await getOrganization({
      accessToken: "tok_test",
      uuid: "org_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(organizationGetFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.calendly.com/organizations/org_001");
    expect(result.action).toBe("organizations.get");
    expect((result.organization as { name: string }).name).toBe("Acme");
  });
});

describe("listRoutingForms", () => {
  test("requires organization", () => {
    expect(() => validateRoutingFormsListInput({})).toThrow("organization is required");
  });

  test("calls GET /routing_forms", async () => {
    const requests: Request[] = [];
    const result = await listRoutingForms({
      accessToken: "tok_test",
      organization: "https://api.calendly.com/organizations/org_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(routingFormsFixture), { status: 200 });
      },
    });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/routing_forms");
    expect(result.action).toBe("routing_forms.list");
    expect((result.routingForms as unknown[]).length).toBe(1);
  });
});

describe("getRoutingForm", () => {
  test("requires uuid", () => {
    expect(() => validateRoutingFormsGetInput({})).toThrow("uuid is required");
  });

  test("calls GET /routing_forms/{uuid}", async () => {
    const requests: Request[] = [];
    const result = await getRoutingForm({
      accessToken: "tok_test",
      uuid: "rf_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(routingFormFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.calendly.com/routing_forms/rf_001");
    expect(result.action).toBe("routing_forms.get");
    expect((result.routingForm as { name: string }).name).toBe("Inbound demo");
  });
});

