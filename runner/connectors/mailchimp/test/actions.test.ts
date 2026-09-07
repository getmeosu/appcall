import { describe, expect, it, mock, afterEach } from "bun:test";
import createContactFixture from "../fixtures/create_contact.json";
import * as httpModule from "../src/http";

const mockFetchJSON = mock(async () => ({
  status: 200,
  headers: { "content-type": "application/json" },
  body: createContactFixture,
}));

mock.module("../src/http", () => ({
  ...httpModule,
  createMailchimpClient: () => ({ fetchJSON: mockFetchJSON }),
}));

import { createContact } from "../src/actions";
import { normalizeContact } from "../src/objects";

describe("createContact action", () => {
  afterEach(() => {
    mockFetchJSON.mockClear();
  });

  it("validates input without apiKey", () => {
    const result = createContact({ listId: "list001", email: "test@example.com", firstName: "Test", lastName: "User" });
    expect(result.connector).toBe("mailchimp");
    expect(result.action).toBe("contacts.create");
    expect((result as any).validated.email).toBe("test@example.com");
    expect((result as any).validated.listId).toBe("list001");
  });

  it("throws when listId is missing", () => {
    expect(() => createContact({ email: "test@example.com" })).toThrow("listId is required");
  });

  it("throws when email is missing", () => {
    expect(() => createContact({ listId: "list001" })).toThrow("email is required");
  });

  it("normalizes a successful create contact response (status 200)", () => {
    const contact = normalizeContact(createContactFixture as any);
    expect(contact.id).toBe("mc-contact:new001");
    expect(contact.email).toBe("newuser@example.com");
    expect(contact.firstName).toBe("New");
    expect(contact.lastName).toBe("User");
    expect(contact.status).toBe("subscribed");
    expect(contact.audienceId).toBe("list001");
  });

  it("creates contact with apiKey using mock fetch (status 200)", async () => {
    const result = await createContact({
      apiKey: "us19abcdef1234",
      listId: "list001",
      email: "newuser@example.com",
      firstName: "New",
      lastName: "User",
    });
    expect(result.connector).toBe("mailchimp");
    expect(result.action).toBe("contacts.create");
    expect((result as any).contact.id).toBe("mc-contact:new001");
    expect((result as any).contact.email).toBe("newuser@example.com");
    expect((result as any).contact.firstName).toBe("New");
    expect((result as any).contact.lastName).toBe("User");
    expect(mockFetchJSON).toHaveBeenCalled();
  });
});
