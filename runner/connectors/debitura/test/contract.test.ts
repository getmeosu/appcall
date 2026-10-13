import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const division = {
  companyName: "Acme Nordic",
  city: "Copenhagen",
  countryCode: "DK",
};

describe("Debitura customer API contract", () => {
  test("sends XApiKey on the customer API host and does not use bearer auth", async () => {
    const seen: Request[] = [];
    await actions["coverage.check-eligibility"]!({
      apiKey: "secret",
      countryAlpha2: "DK",
      debtorType: "Company",
      amount: 100,
      currencyCode: "DKK",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ isEligible: true, jurisdiction: { id: 208 } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("customer-api.debitura.com");
    expect(url.pathname).toBe("/coverage/check-eligibility");
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("xapikey")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe("{\"countryAlpha2\":\"DK\",\"debtorType\":\"Company\",\"amount\":100,\"currencyCode\":\"DKK\"}");
    expect(seen).toHaveLength(1);
  });

  test("keeps list reads body-less and preserves the Payments path", async () => {
    const seen: Request[] = [];
    await actions["payments.list"]!({
      apiKey: "secret",
      page: 1,
      pageSize: 10,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ page: { currentPage: 1 }, payments: [] });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/Payments");
    expect(url.searchParams.get("Page")).toBe("1");
    expect(url.searchParams.get("PageSize")).toBe("10");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    expect(seen).toHaveLength(1);
  });

  test("encodes a division id and repeats case status filters on one route", async () => {
    const seen: Request[] = [];
    await actions["divisions.update"]!({
      apiKey: "secret",
      id: "div/a",
      ...division,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: "div/a", companyName: "Acme Nordic", city: "Copenhagen", isArchived: false });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/divisions/div%2Fa");
    expect(seen[0].method).toBe("PUT");
    expect(seen).toHaveLength(1);

    const listed: Request[] = [];
    await actions["cases.search"]!({
      apiKey: "secret",
      statuses: ["Active", "Paused"],
      sort: "DateCreated:desc",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        listed.push(new Request(input, init));
        return response({ page: { currentPage: 1 }, cases: [] });
      },
    });
    const cases = new URL(listed[0].url);
    expect(cases.pathname).toBe("/cases");
    expect(cases.searchParams.getAll("Statuses")).toEqual(["Active", "Paused"]);
    expect(cases.searchParams.get("Sort")).toBe("DateCreated:desc");
    expect(listed).toHaveLength(1);
  });

  test("rejects bad input, a caller host, malformed JSON, 401, and reads retryAfter", async () => {
    const fetch = async () => response({});
    await expect(actions["divisions.create"]!({ apiKey: "secret", companyName: "", city: "Copenhagen", countryCode: "DK", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["divisions.update"]!({ apiKey: "secret", id: "..", ...division, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["payments.list"]!({ apiKey: "secret", baseUrl: "https://evil.example", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["divisions.list"]!({ apiKey: "secret", fetch: async () => response({}) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["divisions.list"]!({ apiKey: "secret", fetch: async () => response({ title: "Unauthorized", status: 401, detail: "Invalid API Key" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["divisions.list"]!({ apiKey: "secret", fetch: async () => response({ error: "rate_limit_exceeded", message: "Too many requests. Please try again later or contact support if you need higher limits.", retryAfter: 42 }, 429) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 42 });
  });
});
