import { describe, expect, it } from "bun:test";
import { createContactsExtClient, createListsClient } from "../src/contacts_ext";
import { createTemplatesClient } from "../src/templates";

// SEC-PATH-2: SendGrid list/contact ids (UUIDs) and template ids ("d-<hex>" or
// UUID) now pass the shared strict guard before they reach a URL path (or the
// lists.contacts.list SGQL literal).
function recorder() {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ id: "x", result: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetch };
}

describe("sendgrid path id guard", () => {
  for (const bad of [".", ".."]) {
    it(`rejects ${JSON.stringify(bad)} with zero fetches`, async () => {
      const { calls, fetch } = recorder();
      const lists = createListsClient({ apiKey: "SG.x", fetch });
      const contacts = createContactsExtClient({ apiKey: "SG.x", fetch });
      const templates = createTemplatesClient({ apiKey: "SG.x", fetch });
      const attempts: Array<() => Promise<unknown>> = [
        () => lists.get({ listId: bad }),
        () => lists.delete({ listId: bad }),
        () => lists.listContacts({ listId: bad }),
        () => lists.addContacts({ listId: bad, emails: ["a@example.com"] }),
        () => lists.removeContacts({ listId: bad, contactIds: ["c1"] }),
        () => contacts.get({ contactId: bad }),
        () => templates.get({ templateId: bad }),
        () => templates.update({ templateId: bad, name: "n" }),
        () => templates.delete({ templateId: bad }),
      ];
      for (const attempt of attempts) {
        await expect(attempt()).rejects.toThrow("must not be a dot segment");
      }
      expect(calls).toHaveLength(0);
    });
  }

  it("rejects quotes and separators in ids (SGQL and path)", async () => {
    const { calls, fetch } = recorder();
    const lists = createListsClient({ apiKey: "SG.x", fetch });
    for (const bad of ["a'b", "a\"b", "a/b", "a\\b", "%2e%2e"]) {
      await expect(lists.listContacts({ listId: bad })).rejects.toThrow("may only contain");
    }
    expect(calls).toHaveLength(0);
  });

  it("accepts documented id shapes (UUID, d-<hex>, dots/underscores)", async () => {
    const { calls, fetch } = recorder();
    await createListsClient({ apiKey: "SG.x", fetch }).get({ listId: "ca7a3796-e8a8-4029-9ccb-df8937940562" });
    await createTemplatesClient({ apiKey: "SG.x", fetch }).get({ templateId: "d-0123abcd_v1.2" });
    expect(calls.map((url) => new URL(url).pathname)).toEqual([
      "/v3/marketing/lists/ca7a3796-e8a8-4029-9ccb-df8937940562",
      "/v3/templates/d-0123abcd_v1.2",
    ]);
  });
});
