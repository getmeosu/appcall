import { describe, expect, it } from "bun:test";
import {
  getProfile,
  updateProfile,
  createList,
  getList,
  addProfilesToList,
  removeProfilesFromList,
  createEvent,
  getSegment,
  createCampaign,
} from "../src/actions";
import getProfileFixture from "../fixtures/get_profile.json";
import updateProfileFixture from "../fixtures/update_profile.json";
import createListFixture from "../fixtures/create_list.json";
import getListFixture from "../fixtures/get_list.json";
import createEventFixture from "../fixtures/create_event.json";
import getSegmentFixture from "../fixtures/get_segment.json";
import createCampaignFixture from "../fixtures/create_campaign.json";

function mockFetch(status: number, body: unknown) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
    );
}

function mockFetchEmpty(status: number) {
  return () =>
    Promise.resolve(new Response("", { status, headers: {} }));
}

// ─────────────────────────────────────────────────────────────────────────────
// profiles.get
// ─────────────────────────────────────────────────────────────────────────────
describe("getProfile action", () => {
  it("validates input without apiKey", async () => {
    const result = await getProfile({ profileId: "prof1" });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("profiles.get");
    expect((result as any).validated.profileId).toBe("prof1");
  });

  it("throws when profileId is missing", async () => {
    await expect(getProfile({})).rejects.toThrow("profileId is required");
  });

  it("throws for non-object input", async () => {
    await expect(getProfile("bad")).rejects.toThrow("input must be an object");
  });

  it("fetches profile via mock fetch (200)", async () => {
    const fetch = mockFetch(200, getProfileFixture);
    const result = await getProfile({ apiKey: "test-key", profileId: "prof1", fetch });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("profiles.get");
    expect((result as any).profile.providerContactId).toBe("prof1");
    expect((result as any).profile.email).toBe("jane@example.com");
    expect((result as any).profile.firstName).toBe("Jane");
  });

  it("asserts Authorization and revision headers are sent", async () => {
    let capturedHeaders: Record<string, string> = {};
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return Promise.resolve(new Response(JSON.stringify(getProfileFixture), { status: 200, headers: { "content-type": "application/json" } }));
    };
    await getProfile({ apiKey: "my-secret-key", profileId: "prof1", fetch: capturingFetch as any });
    expect(capturedHeaders["Authorization"]).toBe("Klaviyo-API-Key my-secret-key");
    expect(capturedHeaders["revision"]).toBeDefined();
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(getProfile({ apiKey: "k", profileId: "p1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  it("throws upstream error on 404", async () => {
    const fetch = mockFetch(404, {});
    await expect(getProfile({ apiKey: "k", profileId: "p1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Profile not found.",
    });
  });

  it("throws upstream error on 500", async () => {
    const fetch = mockFetch(500, {});
    await expect(getProfile({ apiKey: "k", profileId: "p1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// profiles.update
// ─────────────────────────────────────────────────────────────────────────────
describe("updateProfile action", () => {
  it("validates input without apiKey", async () => {
    const result = await updateProfile({ profileId: "prof1", firstName: "Janet" });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("profiles.update");
    expect((result as any).validated.profileId).toBe("prof1");
    expect((result as any).validated.firstName).toBe("Janet");
  });

  it("throws when profileId is missing", async () => {
    await expect(updateProfile({ firstName: "X" })).rejects.toThrow("profileId is required");
  });

  it("updates profile via mock fetch (200)", async () => {
    const fetch = mockFetch(200, updateProfileFixture);
    const result = await updateProfile({ apiKey: "test-key", profileId: "prof1", firstName: "Janet", fetch });
    expect((result as any).profile.firstName).toBe("Janet");
    expect((result as any).profile.providerContactId).toBe("prof1");
  });

  it("asserts PATCH method and Authorization header", async () => {
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedRevision = "";
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedMethod = init?.method ?? "";
      capturedAuth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"] ?? "";
      capturedRevision = ((init?.headers ?? {}) as Record<string, string>)["revision"] ?? "";
      return Promise.resolve(new Response(JSON.stringify(updateProfileFixture), { status: 200, headers: { "content-type": "application/json" } }));
    };
    await updateProfile({ apiKey: "my-key", profileId: "prof1", firstName: "Janet", fetch: capturingFetch as any });
    expect(capturedMethod).toBe("PATCH");
    expect(capturedAuth).toBe("Klaviyo-API-Key my-key");
    expect(capturedRevision).toBeDefined();
    expect(capturedRevision.length).toBeGreaterThan(0);
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(updateProfile({ apiKey: "k", profileId: "p1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  it("throws upstream error on 404", async () => {
    const fetch = mockFetch(404, {});
    await expect(updateProfile({ apiKey: "k", profileId: "p1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lists.create
// ─────────────────────────────────────────────────────────────────────────────
describe("createList action", () => {
  it("validates input without apiKey", async () => {
    const result = await createList({ name: "My List" });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("lists.create");
    expect((result as any).validated.name).toBe("My List");
  });

  it("throws when name is missing", async () => {
    await expect(createList({})).rejects.toThrow("name is required");
  });

  it("creates list via mock fetch (201)", async () => {
    const fetch = mockFetch(201, createListFixture);
    const result = await createList({ apiKey: "test-key", name: "Newsletter Subscribers", fetch });
    expect(result.connector).toBe("klaviyo");
    expect((result as any).list.name).toBe("Newsletter Subscribers");
    expect((result as any).list.providerListId).toBe("list1");
  });

  it("asserts POST method and correct URL fragment", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"] ?? "";
      return Promise.resolve(new Response(JSON.stringify(createListFixture), { status: 201, headers: { "content-type": "application/json" } }));
    };
    await createList({ apiKey: "api-key", name: "Test", fetch: capturingFetch as any });
    expect(capturedUrl).toContain("a.klaviyo.com");
    expect(capturedUrl).toContain("/lists");
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe("Klaviyo-API-Key api-key");
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(createList({ apiKey: "k", name: "L", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  it("throws upstream error on 500", async () => {
    const fetch = mockFetch(500, {});
    await expect(createList({ apiKey: "k", name: "L", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lists.get
// ─────────────────────────────────────────────────────────────────────────────
describe("getList action", () => {
  it("validates input without apiKey", async () => {
    const result = await getList({ listId: "list1" });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("lists.get");
    expect((result as any).validated.listId).toBe("list1");
  });

  it("throws when listId is missing", async () => {
    await expect(getList({})).rejects.toThrow("listId is required");
  });

  it("fetches list via mock fetch (200)", async () => {
    const fetch = mockFetch(200, getListFixture);
    const result = await getList({ apiKey: "test-key", listId: "list1", fetch });
    expect((result as any).list.providerListId).toBe("list1");
    expect((result as any).list.name).toBe("Newsletter Subscribers");
    expect((result as any).list.totalMembers).toBe(42);
  });

  it("asserts GET method and Authorization header", async () => {
    let capturedMethod = "";
    let capturedAuth = "";
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedMethod = init?.method ?? "GET";
      capturedAuth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"] ?? "";
      return Promise.resolve(new Response(JSON.stringify(getListFixture), { status: 200, headers: { "content-type": "application/json" } }));
    };
    await getList({ apiKey: "my-key", listId: "list1", fetch: capturingFetch as any });
    expect(capturedAuth).toBe("Klaviyo-API-Key my-key");
  });

  it("throws upstream error on 404", async () => {
    const fetch = mockFetch(404, {});
    await expect(getList({ apiKey: "k", listId: "l1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(getList({ apiKey: "k", listId: "l1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// profiles.addToList
// ─────────────────────────────────────────────────────────────────────────────
describe("addProfilesToList action", () => {
  it("validates input without apiKey", async () => {
    const result = await addProfilesToList({ listId: "list1", profileIds: ["prof1", "prof2"] });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("profiles.addToList");
    expect((result as any).validated.listId).toBe("list1");
    expect((result as any).validated.profileIds).toEqual(["prof1", "prof2"]);
  });

  it("throws when listId is missing", async () => {
    await expect(addProfilesToList({ profileIds: ["p1"] })).rejects.toThrow("listId is required");
  });

  it("throws when profileIds is empty", async () => {
    await expect(addProfilesToList({ listId: "l1", profileIds: [] })).rejects.toThrow("profileIds must be a non-empty array");
  });

  it("adds profiles via mock fetch (204)", async () => {
    const fetch = mockFetchEmpty(204);
    const result = await addProfilesToList({ apiKey: "test-key", listId: "list1", profileIds: ["p1", "p2"], fetch });
    expect(result.connector).toBe("klaviyo");
    expect((result as any).added).toBe(2);
  });

  it("asserts POST to relationships/profiles URL with Authorization and revision", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedRevision = "";
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"] ?? "";
      capturedRevision = ((init?.headers ?? {}) as Record<string, string>)["revision"] ?? "";
      return Promise.resolve(new Response("", { status: 204 }));
    };
    await addProfilesToList({ apiKey: "api-key", listId: "list1", profileIds: ["p1"], fetch: capturingFetch as any });
    expect(capturedUrl).toContain("/lists/list1/relationships/profiles");
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe("Klaviyo-API-Key api-key");
    expect(capturedRevision).toBeDefined();
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(addProfilesToList({ apiKey: "k", listId: "l1", profileIds: ["p1"], fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  it("throws upstream error on 404", async () => {
    const fetch = mockFetch(404, {});
    await expect(addProfilesToList({ apiKey: "k", listId: "l1", profileIds: ["p1"], fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "List not found.",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// profiles.removeFromList
// ─────────────────────────────────────────────────────────────────────────────
describe("removeProfilesFromList action", () => {
  it("validates input without apiKey", async () => {
    const result = await removeProfilesFromList({ listId: "list1", profileIds: ["prof1"] });
    expect((result as any).validated.listId).toBe("list1");
    expect((result as any).validated.profileIds).toEqual(["prof1"]);
  });

  it("throws when profileIds is missing", async () => {
    await expect(removeProfilesFromList({ listId: "l1" })).rejects.toThrow("profileIds must be a non-empty array");
  });

  it("removes profiles via mock fetch (204)", async () => {
    const fetch = mockFetchEmpty(204);
    const result = await removeProfilesFromList({ apiKey: "k", listId: "list1", profileIds: ["p1"], fetch });
    expect((result as any).removed).toBe(1);
  });

  it("asserts DELETE method and correct URL", async () => {
    let capturedMethod = "";
    let capturedUrl = "";
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      return Promise.resolve(new Response("", { status: 204 }));
    };
    await removeProfilesFromList({ apiKey: "k", listId: "mylist", profileIds: ["p1"], fetch: capturingFetch as any });
    expect(capturedMethod).toBe("DELETE");
    expect(capturedUrl).toContain("/lists/mylist/relationships/profiles");
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(removeProfilesFromList({ apiKey: "k", listId: "l1", profileIds: ["p1"], fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// events.create
// ─────────────────────────────────────────────────────────────────────────────
describe("createEvent action", () => {
  it("validates input without apiKey", async () => {
    const result = await createEvent({ metricName: "Placed Order", profileEmail: "buyer@example.com" });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("events.create");
    expect((result as any).validated.metricName).toBe("Placed Order");
    expect((result as any).validated.profileEmail).toBe("buyer@example.com");
  });

  it("throws when metricName is missing", async () => {
    await expect(createEvent({ profileEmail: "x@x.com" })).rejects.toThrow("metricName is required");
  });

  it("throws when profileEmail is missing", async () => {
    await expect(createEvent({ metricName: "Test" })).rejects.toThrow("profileEmail is required");
  });

  it("creates event via mock fetch (202)", async () => {
    const fetch = mockFetch(202, createEventFixture);
    const result = await createEvent({ apiKey: "test-key", metricName: "Placed Order", profileEmail: "buyer@example.com", fetch });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("events.create");
    expect((result as any).event).toBeDefined();
  });

  it("asserts POST method, Authorization and revision headers", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedRevision = "";
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"] ?? "";
      capturedRevision = ((init?.headers ?? {}) as Record<string, string>)["revision"] ?? "";
      return Promise.resolve(new Response(JSON.stringify(createEventFixture), { status: 202, headers: { "content-type": "application/json" } }));
    };
    await createEvent({ apiKey: "secret", metricName: "Viewed Product", profileEmail: "x@x.com", fetch: capturingFetch as any });
    expect(capturedUrl).toContain("/events");
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe("Klaviyo-API-Key secret");
    expect(capturedRevision.length).toBeGreaterThan(0);
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(createEvent({ apiKey: "k", metricName: "M", profileEmail: "e@e.com", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  it("throws upstream error on 500", async () => {
    const fetch = mockFetch(500, {});
    await expect(createEvent({ apiKey: "k", metricName: "M", profileEmail: "e@e.com", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// segments.get
// ─────────────────────────────────────────────────────────────────────────────
describe("getSegment action", () => {
  it("validates input without apiKey", async () => {
    const result = await getSegment({ segmentId: "seg1" });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("segments.get");
    expect((result as any).validated.segmentId).toBe("seg1");
  });

  it("throws when segmentId is missing", async () => {
    await expect(getSegment({})).rejects.toThrow("segmentId is required");
  });

  it("fetches segment via mock fetch (200)", async () => {
    const fetch = mockFetch(200, getSegmentFixture);
    const result = await getSegment({ apiKey: "test-key", segmentId: "seg1", fetch });
    expect((result as any).segment.providerSegmentId).toBe("seg1");
    expect((result as any).segment.name).toBe("High-Value Customers");
    expect((result as any).segment.profileCount).toBe(250);
  });

  it("asserts Authorization and revision headers", async () => {
    let capturedAuth = "";
    let capturedRevision = "";
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedAuth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"] ?? "";
      capturedRevision = ((init?.headers ?? {}) as Record<string, string>)["revision"] ?? "";
      return Promise.resolve(new Response(JSON.stringify(getSegmentFixture), { status: 200, headers: { "content-type": "application/json" } }));
    };
    await getSegment({ apiKey: "seg-key", segmentId: "seg1", fetch: capturingFetch as any });
    expect(capturedAuth).toBe("Klaviyo-API-Key seg-key");
    expect(capturedRevision.length).toBeGreaterThan(0);
  });

  it("throws upstream error on 404", async () => {
    const fetch = mockFetch(404, {});
    await expect(getSegment({ apiKey: "k", segmentId: "s1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Segment not found.",
    });
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(getSegment({ apiKey: "k", segmentId: "s1", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// campaigns.create
// ─────────────────────────────────────────────────────────────────────────────
describe("createCampaign action", () => {
  it("validates input without apiKey", async () => {
    const result = await createCampaign({ name: "Summer Sale", channel: "email" });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("campaigns.create");
    expect((result as any).validated.name).toBe("Summer Sale");
    expect((result as any).validated.channel).toBe("email");
  });

  it("throws when name is missing", async () => {
    await expect(createCampaign({ channel: "email" })).rejects.toThrow("name is required");
  });

  it("throws on invalid channel", async () => {
    await expect(createCampaign({ name: "X", channel: "push" })).rejects.toThrow("channel must be");
  });

  it("creates campaign via mock fetch (201)", async () => {
    const fetch = mockFetch(201, createCampaignFixture);
    const result = await createCampaign({ apiKey: "test-key", name: "Summer Sale 2024", channel: "email", fetch });
    expect(result.connector).toBe("klaviyo");
    expect((result as any).campaign.name).toBe("Summer Sale 2024");
    expect((result as any).campaign.providerCampaignId).toBe("camp1");
    expect((result as any).campaign.status).toBe("draft");
  });

  it("asserts POST method, URL, Authorization and revision headers", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedRevision = "";
    const capturingFetch = (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method ?? "";
      capturedAuth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"] ?? "";
      capturedRevision = ((init?.headers ?? {}) as Record<string, string>)["revision"] ?? "";
      return Promise.resolve(new Response(JSON.stringify(createCampaignFixture), { status: 201, headers: { "content-type": "application/json" } }));
    };
    await createCampaign({ apiKey: "camp-key", name: "Test", channel: "sms", fetch: capturingFetch as any });
    expect(capturedUrl).toContain("a.klaviyo.com");
    expect(capturedUrl).toContain("/campaigns");
    expect(capturedMethod).toBe("POST");
    expect(capturedAuth).toBe("Klaviyo-API-Key camp-key");
    expect(capturedRevision.length).toBeGreaterThan(0);
  });

  it("throws rate limit error on 429", async () => {
    const fetch = mockFetch(429, {});
    await expect(createCampaign({ apiKey: "k", name: "C", channel: "email", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  it("throws upstream error on 500", async () => {
    const fetch = mockFetch(500, {});
    await expect(createCampaign({ apiKey: "k", name: "C", channel: "email", fetch })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
