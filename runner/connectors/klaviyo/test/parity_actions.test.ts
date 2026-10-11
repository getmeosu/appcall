import { describe, expect, it } from "bun:test";
import {
  bulkCreateClientEvents,
  createClientEvent,
  createTagRelationships,
  getEventRelationships,
  getTagRelationships,
  unsubscribeProfilesBulk,
  unsuppressProfilesBulk,
  uploadImageFromFile,
} from "../src/parity_actions";

function capture(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
  return { calls, fetchImpl };
}

describe("klaviyo client tools", () => {
  it("rejects a client event without companyId", async () => {
    await expect(createClientEvent({ data: { type: "event" } })).rejects.toThrow("companyId is required");
  });

  it("posts a client event with company_id and without the private key", async () => {
    const { calls, fetchImpl } = capture(202, { data: { type: "event", id: "evt" } });
    const result = await createClientEvent({
      companyId: "public-site",
      apiKey: "private-key",
      data: { type: "event", attributes: { metric: { name: "Viewed" } } },
      fetch: fetchImpl,
    });
    expect(result.action).toBe("client.events.create");
    expect(calls[0].url).toContain("https://a.klaviyo.com/client/events?company_id=public-site");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.revision).toBe("2026-07-15");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ data: { type: "event", attributes: { metric: { name: "Viewed" } } } });
  });

  it("posts bulk client events to the bulk client path", async () => {
    const { calls, fetchImpl } = capture(202, null);
    await bulkCreateClientEvents({
      company_id: "site",
      data: { type: "event-bulk-create", attributes: {} },
      fetch: fetchImpl,
    });
    expect(calls[0].url).toContain("/client/event-bulk-create?company_id=site");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("klaviyo file upload and relationship tools", () => {
  it("uploads an image with the private key and no JSON content type", async () => {
    const { calls, fetchImpl } = capture(201, { data: { type: "image", id: "img" } });
    const result = await uploadImageFromFile({
      apiKey: "private-key",
      fileBase64: Buffer.from("png").toString("base64"),
      fileName: "hero.png",
      name: "Hero",
      fetch: fetchImpl,
    });
    expect(result.action).toBe("images.uploadFromFile");
    expect(calls[0].url).toBe("https://a.klaviyo.com/api/image-upload");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Klaviyo-API-Key private-key");
    expect(headers["content-type"]).toBeUndefined();
    expect(calls[0].init?.body).toBeInstanceOf(FormData);
  });

  it("creates a tag relationship on the selected resource", async () => {
    const { calls, fetchImpl } = capture(204, null);
    await createTagRelationships({
      apiKey: "private-key",
      id: "tag1",
      relatedResource: "flows",
      data: [{ type: "flow", id: "flow1" }],
      fetch: fetchImpl,
    });
    expect(calls[0].url).toContain("/api/tags/tag1/relationships/flows");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Klaviyo-API-Key private-key");
  });

  it("reads an event metric relationship", async () => {
    const { calls, fetchImpl } = capture(200, { data: { type: "metric", id: "met1" } });
    const result = await getEventRelationships({ apiKey: "private-key", id: "evt1", related_resource: "metric", fetch: fetchImpl });
    expect(calls[0].url).toContain("/api/events/evt1/relationships/metric");
    expect((result as { data: { data: { id: string } } }).data.data.id).toBe("met1");
  });

  it("rejects an unknown tag relationship", async () => {
    await expect(getTagRelationships({ id: "tag1", relatedResource: "images" })).rejects.toThrow("relatedResource must be one of");
  });

  it("unsubscribes emails on a list", async () => {
    const { calls, fetchImpl } = capture(202, { data: { type: "profile-subscription-bulk-delete-job", id: "job1" } });
    await unsubscribeProfilesBulk({ apiKey: "private-key", emails: ["a@example.com"], list_id: "list1", fetch: fetchImpl });
    expect(calls[0].url).toContain("/api/profile-subscription-bulk-delete-jobs");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.data.type).toBe("profile-subscription-bulk-delete-job");
    expect(body.data.relationships.list.data.id).toBe("list1");
    expect(body.data.attributes.profiles.data[0].attributes.email).toBe("a@example.com");
  });

  it("unsuppresses email addresses", async () => {
    const { calls, fetchImpl } = capture(202, { data: { id: "job2" } });
    await unsuppressProfilesBulk({ apiKey: "private-key", suppressions: ["b@example.com"], fetch: fetchImpl });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.data.type).toBe("profile-suppression-bulk-delete-job");
    expect(body.data.attributes.profiles.data[0].attributes.email).toBe("b@example.com");
  });
});
