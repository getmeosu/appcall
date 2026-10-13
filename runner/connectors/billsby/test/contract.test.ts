import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const customer = {
  customerUniqueId: "6ZY37ULDEF",
  firstName: "Mary",
  lastName: "Quinn",
  email: "mary.quinn@example.com",
};

describe("Billsby contract", () => {
  test("uses the ApiKey header on the fixed public host", async () => {
    const seen: Request[] = [];
    await actions["customers.list"]!({
      apiKey: "secret",
      companyDomain: "widgets",
      page: 1,
      pageSize: 10,
      search: "mary",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ currentPage: 1, pageCount: 1, pageSize: 10, rowCount: 1, results: [customer] });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("public.billsby.com");
    expect(url.pathname).toBe("/api/v1/rest/core/widgets/customers");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(url.searchParams.get("search")).toBe("mary");
    expect(seen[0].headers.get("apikey")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
  });

  test("keeps a company label in the path and does not follow another host", async () => {
    const seen: Request[] = [];
    await actions["customers.get"]!({
      apiKey: "secret",
      companyDomain: "https://evil.example",
      customerUniqueId: "id/a",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(customer);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("public.billsby.com");
    expect(url.pathname).toBe("/api/v1/rest/core/https%3A%2F%2Fevil.example/customers/id%2Fa");
    expect(seen).toHaveLength(1);
  });

  test("sends the documented flat create body and nested update body", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ customerUniqueId: "6ZY37ULDEF" });
    };
    const billingAddress = {
      addressLine1: "23 Turnabout Road",
      city: "Brighton",
      state: "East Sussex",
      country: "GBR",
      postCode: "BN3 4WH",
    };
    await actions["customers.create"]!({
      apiKey: "secret",
      companyDomain: "widgets",
      firstName: "Robert",
      lastName: "Dowling",
      email: "robert.dowling@example.com",
      billingAddress,
      fetch,
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(
      "{\"firstName\":\"Robert\",\"lastName\":\"Dowling\",\"email\":\"robert.dowling@example.com\",\"addressLine1\":\"23 Turnabout Road\",\"city\":\"Brighton\",\"state\":\"East Sussex\",\"country\":\"GBR\",\"postCode\":\"BN3 4WH\"}",
    );
    await actions["customers.update"]!({
      apiKey: "secret",
      companyDomain: "widgets",
      customerUniqueId: "6ZY37ULDEF",
      firstName: "Mary",
      lastName: "Quinn",
      email: "mary.quinn@example.com",
      billingAddress,
      fetch,
    });
    expect(seen[1].method).toBe("PUT");
    expect(new URL(seen[1].url).pathname).toBe("/api/v1/rest/core/widgets/customers/6ZY37ULDEF");
    expect(await seen[1].text()).toBe(
      "{\"firstName\":\"Mary\",\"lastName\":\"Quinn\",\"email\":\"mary.quinn@example.com\",\"billingAddress\":{\"addressLine1\":\"23 Turnabout Road\",\"city\":\"Brighton\",\"state\":\"East Sussex\",\"country\":\"GBR\",\"postCode\":\"BN3 4WH\"}}",
    );
  });

  test("validates input, malformed output, 401 and 429", async () => {
    const fetch = async () => response({});
    await expect(actions["customers.get"]!({ apiKey: "secret", companyDomain: "widgets", customerUniqueId: "", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["customers.get"]!({ apiKey: "secret", companyDomain: "..", customerUniqueId: "6ZY37ULDEF", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["customers.list"]!({ apiKey: "secret", companyDomain: "widgets", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["customers.get"]!({ apiKey: "secret", companyDomain: "widgets", customerUniqueId: "6ZY37ULDEF", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["customers.get"]!({ apiKey: "secret", companyDomain: "widgets", customerUniqueId: "6ZY37ULDEF", fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["customers.get"]!({ apiKey: "secret", companyDomain: "widgets", customerUniqueId: "6ZY37ULDEF", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
