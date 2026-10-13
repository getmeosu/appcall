import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const contact = {
  id: "147135",
  customId: "TE567890",
  firstName: "Robert",
  lastName: "Gerard",
  email: "basetest@evenium.com",
};

describe("Evenium contract", () => {
  test("sends the API key as X-Evenium-Token and does not send a GET body", async () => {
    const seen: Request[] = [];
    await actions["contacts.list"]!({
      apiKey: "secret",
      maxResults: 10,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ contacts: [contact], nbrResults: "1" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("x-evenium-token")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://evenium.com");
    expect(url.pathname).toBe("/api/1/contacts");
    expect(url.searchParams.get("maxResults")).toBe("10");
    expect(url.searchParams.get("accessToken")).toBeNull();
  });

  test("encodes contact ids and keeps the ext prefix literal", async () => {
    const seen: Request[] = [];
    const fetchImpl = async (input: unknown, init: unknown) => {
      seen.push(new Request(input as RequestInfo, init as RequestInit));
      return response(contact);
    };
    await actions["contacts.get"]!({ apiKey: "tok", contactId: "id:147/135", fetch: fetchImpl });
    expect(new URL(seen[0].url).pathname).toBe("/api/1/contacts/id%3A147%2F135");
    await actions["contacts.updateByCustomId"]!({
      apiKey: "tok",
      customId: "TE/567890",
      email: "basetest@evenium.com",
      fetch: fetchImpl,
    });
    expect(seen[1].method).toBe("PUT");
    expect(new URL(seen[1].url).pathname).toBe("/api/1/contacts/ext:TE%2F567890");
    expect(seen[1].headers.get("content-type")).toBe("application/json");
    expect(await seen[1].text()).toBe("{\"email\":\"basetest@evenium.com\"}");
  });

  test("wraps a JSON event array and does not issue a second request", async () => {
    const seen: Request[] = [];
    const result = await actions["contacts.events.list"]!({
      apiKey: "tok",
      contactId: "147135",
      startsAfter: "2017-06-02T10:00:00.000Z",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ id: 47401, title: "Annual", webSite: "https://evil.example/event" }]);
      },
    });
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).searchParams.get("startsAfter")).toBe("2017-06-02T10:00:00.000Z");
    expect(result.events).toHaveLength(1);
  });

  test("validates input, malformed output, 401 and 429", async () => {
    await expect(actions["contacts.get"]!({
      apiKey: "tok",
      contactId: "",
      fetch: async () => response(contact),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.list"]!({
      apiKey: "secret",
      fetch: async () => response({ contacts: {} }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["contacts.list"]!({
      apiKey: "secret",
      fetch: async () => response({ code: "AUTHENTICATION_REQUIRED", message: "Authentification required" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["events.list"]!({
      apiKey: "secret",
      fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
