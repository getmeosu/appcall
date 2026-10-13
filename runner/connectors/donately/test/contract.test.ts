import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const creds = {
  apiToken: "fixture-api-token",
  accountId: "act_ba7d12ab27bb",
};
const auth = "Basic Zml4dHVyZS1hcGktdG9rZW46";
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const listBody = { object: "list", data: [{ id: "row_1" }], summary: { count: 1 }, request_id: "req_1" };

describe("Donately contract", () => {
  test("current account uses basic auth with an empty password and does not follow links", async () => {
    const seen: Request[] = [];
    const result = await actions["accounts.current"]!({
      ...creds,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({
          object: "account",
          id: "act_ba7d12ab27bb",
          title: "My Nonprofit",
          next: "https://evil.example/next",
        });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body).toBeNull();
    expect(seen[0].headers.get("authorization")).toBe(auth);
    expect(seen[0].headers.get("donately-version")).toBe("2022-12-15");
    expect(seen[0].headers.get("donately-account")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.host).toBe("api.donately.com");
    expect(url.pathname).toBe("/v2/accounts/mine");
    expect(url.search).toBe("");
    expect(result.account.id).toBe("act_ba7d12ab27bb");
  });

  test("scopes lists with the account header and sends documented campaign filters", async () => {
    const seen: Request[] = [];
    await actions["campaigns.list"]!({
      ...creds,
      status: "published",
      hasFundraisers: true,
      limit: 10,
      sort: "DESC",
      orderBy: "created_at",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(listBody);
      },
    });
    expect(seen[0].headers.get("donately-account")).toBe("act_ba7d12ab27bb");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v2/campaigns");
    expect(url.searchParams.get("status")).toBe("published");
    expect(url.searchParams.get("has_fundraisers")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("sort")).toBe("DESC");
    expect(url.searchParams.get("order_by")).toBe("created_at");
    expect(url.searchParams.get("account_id")).toBeNull();
  });

  test("sends donation filters, including false flags and created bounds", async () => {
    const seen: Request[] = [];
    const result = await actions["donations.list"]!({
      ...creds,
      status: "completed",
      recurring: false,
      anonymous: false,
      amountInCents: 5000,
      offset: 0,
      created: { gt: "1700000000", lt: "1800000000" },
      updated: { gt: "1700000001" },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(listBody);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v2/donations");
    expect(url.searchParams.get("recurring")).toBe("false");
    expect(url.searchParams.get("anonymous")).toBe("false");
    expect(url.searchParams.get("amount_in_cents")).toBe("5000");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("created[gt]")).toBe("1700000000");
    expect(url.searchParams.get("created[lt]")).toBe("1800000000");
    expect(url.searchParams.get("updated[gt]")).toBe("1700000001");
    expect(result.data).toHaveLength(1);
  });

  test("encodes a form id and a people keyword without leaving the host", async () => {
    const seen: Request[] = [];
    const fetch = async (input: unknown, init: { method?: string; headers?: HeadersInit; body?: unknown }) => {
      seen.push(new Request(input, init));
      return response(seen.length === 1 ? { object: "form", id: "frm/a" } : listBody);
    };
    await actions["forms.get"]!({ ...creds, formId: "frm/a", fetch });
    expect(new URL(seen[0].url).pathname).toBe("/v2/forms/frm%2Fa");
    await actions["people.list"]!({ ...creds, keyword: "ada@example.com", fetch });
    const people = new URL(seen[1].url);
    expect(people.host).toBe("api.donately.com");
    expect(people.pathname).toBe("/v2/people");
    expect(people.searchParams.get("keyword")).toBe("ada@example.com");
  });

  test("rejects a free-form URL, a bad page, a dot segment, a colon in the token, a non-object list, 401, and 429", async () => {
    await expect(actions["forms.list"]!({
      ...creds,
      url: "https://evil.example",
      fetch: async () => response(listBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["subscriptions.list"]!({
      ...creds,
      limit: 0,
      fetch: async () => response(listBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["campaigns.list"]!({
      ...creds,
      limit: 101,
      fetch: async () => response(listBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["people.get"]!({
      ...creds,
      personId: "..",
      fetch: async () => response({ object: "person" }),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["forms.get"]!({
      ...creds,
      formId: "",
      fetch: async () => response({ object: "form" }),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    let calls = 0;
    await expect(actions["accounts.current"]!({
      ...creds,
      apiToken: "bad:token",
      fetch: async () => {
        calls += 1;
        return response({ object: "account" });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
    await expect(actions["webhooks.list"]!({
      ...creds,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["forms.list"]!({
      ...creds,
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["people.list"]!({
      ...creds,
      fetch: async () => response({ message: "unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["fundraisers.list"]!({
      ...creds,
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
