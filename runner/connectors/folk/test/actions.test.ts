import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import user from "../fixtures/user.json";
import list from "../fixtures/list.json";
import person from "../fixtures/person.json";
import company from "../fixtures/company.json";
import note from "../fixtures/note.json";
import deleted from "../fixtures/deleted.json";
import notesList from "../fixtures/notes_list.json";
import remindersList from "../fixtures/reminders_list.json";
import webhooksList from "../fixtures/webhooks_list.json";
import customFieldsList from "../fixtures/custom_fields_list.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, { inputSchema?: { properties?: Record<string, any>; required?: string[] }; request: { method: string; path: string } }>;
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] } | undefined): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema?.required ?? []) {
    const prop = schema?.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      input[key] = items.type === "object" ? [{ id: "grp_1234567890123456789012345678901234567890" }] : ["a"];
    } else if (prop.type === "object") input[key] = { id: "per_1234567890123456789012345678901234567890" };
    else input[key] = key === "name" ? "Example Corp" : "per_1234567890123456789012345678901234567890";
  }
  return input;
}

describe("folk HTTP contract", () => {
  test("healthcheck uses bearer auth", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(user);
      },
    });
    expect(seen[0].url).toBe("https://api.folk.app/v1/users/me");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(result).toMatchObject({ user: user.data, source: "provider" });
  });

  test("preserves pagination metadata and never follows nextLink", async () => {
    const seen: Request[] = [];
    const result = await actions["people.list"]!({
      apiKey: "secret",
      limit: 10,
      cursor: "a b",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(list);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.searchParams.get("cursor")).toBe("a b");
    expect(result).toMatchObject({
      people: list.data.items,
      pagination: { nextLink: list.data.pagination.nextLink },
      source: "provider",
    });
    expect(seen).toHaveLength(1);
  });

  test("maps 401 and malformed output safely", async () => {
    await expect(actions["users.list"]!({ apiKey: "secret", fetch: async () => response({ message: "no" }, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(actions["users.list"]!({ apiKey: "secret", fetch: async () => response({ data: {} }) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
  });

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const seen: Request[] = [];
      const input = dummyInput(operation.inputSchema);
      const body =
        key.endsWith(".delete") ? deleted
        : key.startsWith("notes") && !key.endsWith(".list") ? note
        : key.startsWith("people") && !key.endsWith(".list") ? person
        : key.startsWith("companies") && !key.endsWith(".list") ? company
        : key === "webhooks.list" ? webhooksList
        : key === "notes.list" ? notesList
        : key === "reminders.list" ? remindersList
        : key === "groups.customFields.list" ? customFieldsList
        : key === "healthcheck" || key === "users.get" ? user
        : list;
      await actions[key]!({
        apiKey: "secret",
        ...input,
        fetch: async (url, init) => {
          seen.push(new Request(url, init));
          return response(body);
        },
      });
      expect(seen, key).toHaveLength(1);
      expect(seen[0]!.method, key).toBe(operation.request.method);
      expect(new URL(seen[0]!.url).hostname, key).toBe("api.folk.app");
      expect(seen[0]!.headers.get("authorization"), key).toBe("Bearer secret");
    }
  });

  test("create person posts Folk people fields and omits unset keys", async () => {
    const seen: Request[] = [];
    const result = await actions["people.create"]!({
      apiKey: "secret",
      firstName: "Ada",
      lastName: "Example",
      emails: ["ada@example.com"],
      groups: [{ id: "grp_1234567890123456789012345678901234567890" }],
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(person);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("https://api.folk.app/v1/people");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].json()).toEqual({
      firstName: "Ada",
      lastName: "Example",
      emails: ["ada@example.com"],
      groups: [{ id: "grp_1234567890123456789012345678901234567890" }],
    });
    expect(result).toMatchObject({ person: person.data, source: "provider" });
  });

  test("update person keeps personId on the path and out of the body", async () => {
    const seen: Request[] = [];
    await actions["people.update"]!({
      apiKey: "secret",
      personId: "per_1234567890123456789012345678901234567890",
      jobTitle: "Engineer",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(person);
      },
    });
    expect(seen[0].method).toBe("PATCH");
    expect(new URL(seen[0].url).pathname).toBe("/v1/people/per_1234567890123456789012345678901234567890");
    expect(await seen[0].json()).toEqual({ jobTitle: "Engineer" });
  });

  test("create company requires a name", async () => {
    await expect(actions["companies.create"]!({ apiKey: "secret", fetch: async () => response(company) })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    const seen: Request[] = [];
    const result = await actions["companies.create"]!({
      apiKey: "secret",
      name: "Example Corp",
      industry: "Technology",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(company);
      },
    });
    expect(await seen[0].json()).toEqual({ name: "Example Corp", industry: "Technology" });
    expect(result).toMatchObject({ company: company.data });
  });

  test("create note posts entity, content, and visibility", async () => {
    const seen: Request[] = [];
    const result = await actions["notes.create"]!({
      apiKey: "secret",
      entity: { id: "per_1234567890123456789012345678901234567890" },
      content: "Follow up next week",
      visibility: "public",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(note);
      },
    });
    expect(seen[0].url).toBe("https://api.folk.app/v1/notes");
    expect(await seen[0].json()).toEqual({
      entity: { id: "per_1234567890123456789012345678901234567890" },
      content: "Follow up next week",
      visibility: "public",
    });
    expect(result).toMatchObject({ note: note.data });
  });

  test("delete person returns the deleted id", async () => {
    const seen: Request[] = [];
    const result = await actions["people.delete"]!({
      apiKey: "secret",
      personId: "per_1234567890123456789012345678901234567890",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(deleted);
      },
    });
    expect(seen[0].method).toBe("DELETE");
    expect(new URL(seen[0].url).pathname).toBe("/v1/people/per_1234567890123456789012345678901234567890");
    expect(result).toMatchObject({ id: deleted.data.id, source: "provider" });
  });

  test("list reminders sends entity.id as a query parameter", async () => {
    const seen: Request[] = [];
    const result = await actions["reminders.list"]!({
      apiKey: "secret",
      entityId: "per_1234567890123456789012345678901234567890",
      limit: 20,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(remindersList);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/reminders");
    expect(url.searchParams.get("entity.id")).toBe("per_1234567890123456789012345678901234567890");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(result).toMatchObject({ reminders: remindersList.data.items });
  });

  test("list group custom fields interpolates group and entity type", async () => {
    const seen: Request[] = [];
    const result = await actions["groups.customFields.list"]!({
      apiKey: "secret",
      groupId: "grp_1234567890123456789012345678901234567890",
      entityType: "person",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(customFieldsList);
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v1/groups/grp_1234567890123456789012345678901234567890/custom-fields/person");
    expect(result).toMatchObject({ customFields: customFieldsList.data.items });
  });

  test("list webhooks maps nested Folk items", async () => {
    const seen: Request[] = [];
    const result = await actions["webhooks.list"]!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(webhooksList);
      },
    });
    expect(seen[0].url).toBe("https://api.folk.app/v1/webhooks");
    expect(result).toMatchObject({ webhooks: webhooksList.data.items, pagination: { nextLink: webhooksList.data.pagination.nextLink } });
  });

  test("list notes maps nested Folk items", async () => {
    const result = await actions["notes.list"]!({
      apiKey: "secret",
      fetch: async () => response(notesList),
    });
    expect(result).toMatchObject({ notes: notesList.data.items });
  });
});
