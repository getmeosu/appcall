import { describe, expect, it } from "bun:test";
import { extractAction, operationKeyFor } from "../extract";
import * as fixtures from "./fixtures/actions";

describe("operationKeyFor", () => {
  it("splits a leading verb off and pluralises the resource", () => {
    expect(operationKeyFor("create_contact")).toBe("contacts.create");
    expect(operationKeyFor("get_contact")).toBe("contacts.get");
    expect(operationKeyFor("update_deal")).toBe("deals.update");
    expect(operationKeyFor("delete_company")).toBe("companies.delete");
  });

  it("normalises camelCase action names", () => {
    expect(operationKeyFor("createContact")).toBe("contacts.create");
  });

  it("maps synonym verbs onto the canonical one", () => {
    expect(operationKeyFor("find_user")).toBe("users.search");
    expect(operationKeyFor("remove_tag")).toBe("tags.delete");
    expect(operationKeyFor("add_note")).toBe("notes.create");
  });

  it("falls back to a run verb for a name with no recognised verb", () => {
    expect(operationKeyFor("run_app")).toBe("apps.run");
    expect(operationKeyFor("whoami")).toBe("whoami.run");
  });

  it("leaves an already plural resource alone", () => {
    expect(operationKeyFor("list_all_tags")).toBe("all-tags.list");
  });
});

describe("extractAction", () => {
  it("recovers a direct httpClient call including renamed body fields", async () => {
    const extracted = await extractAction(fixtures.createContact as never);
    expect(extracted.key).toBe("contacts.create");
    expect(extracted.title).toBe("Create Contact");
    expect(extracted.description).toBe("Create a contact. Creates a contact from an email and optional name.");
    expect(extracted.sideEffect).toBe("write");
    expect(extracted.inputSchema.required).toEqual(["email"]);
    expect(extracted.baseUrl).toBe("https://api.fixture.test");
    expect(extracted.authIn).toEqual({ in: "header", name: "Authorization", value: "Bearer __AP_AUTH__" });
    expect(extracted.request).toEqual({
      method: "POST",
      path: "/v2/contacts",
      body: { email: "{{email}}", first_name: "{{firstName}}", labels: "{{tags}}" },
    });
    expect(extracted.review).toEqual([]);
  });

  it("recovers a path parameter and query parameters", async () => {
    const extracted = await extractAction(fixtures.getContact as never);
    expect(extracted.key).toBe("contacts.get");
    expect(extracted.sideEffect).toBe("read");
    expect(extracted.request).toEqual({
      method: "GET",
      path: "/v2/contacts/{{contactId}}",
      query: { expand: "{{expand}}" },
    });
  });

  it("sees through the piece's own request helper", async () => {
    const extracted = await extractAction(fixtures.updateDeal as never);
    expect(extracted.request).toEqual({
      method: "PATCH",
      path: "/v2/deals/{{dealId}}",
      headers: { "Content-Type": "application/json" },
      body: { amount_cents: "{{amount}}", notes: "{{notes}}" },
    });
    expect(extracted.authIn?.value).toBe("Bearer __AP_AUTH__");
  });

  it("refuses to guess when an action issues more than one request", async () => {
    const extracted = await extractAction(fixtures.archiveDeal as never);
    expect(extracted.request).toBeUndefined();
    expect(extracted.review.join(" ")).toContain("2 requests recorded");
    expect(extracted.title).toBe("Archive Deal");
    expect(extracted.inputSchema.required).toEqual(["dealId"]);
  });

  it("still yields title, description, and schema for a vendor-SDK action", async () => {
    const extracted = await extractAction(fixtures.sdkAction as never);
    expect(extracted.request).toBeUndefined();
    expect(extracted.review.join(" ")).toContain("no HTTP request was recorded");
    expect(extracted.title).toBe("Create Ticket");
    expect(extracted.inputSchema.properties.subject!.type).toBe("string");
  });

  it("flags a boolean input it cannot trace", async () => {
    const extracted = await extractAction(fixtures.toggleAction as never);
    expect(extracted.review.join(" ")).toContain("boolean input(s) subscribed");
    expect(extracted.request).toBeDefined();
  });

  it("keeps the request but flags the throw when an action reads the response body", async () => {
    // The request was already issued before the action tripped over the empty
    // mocked response, so the template is recoverable — but the reviewer needs
    // to know the response handling was never observed.
    const extracted = await extractAction(fixtures.brokenAction as never);
    expect(extracted.request).toEqual({ method: "GET", path: "/v2/reports" });
    expect(extracted.review.join(" ")).toContain("run threw");
  });

  it("does not leak recorded requests between extractions", async () => {
    await extractAction(fixtures.archiveDeal as never);
    const extracted = await extractAction(fixtures.getContact as never);
    expect(extracted.request).toBeDefined();
    expect(extracted.review).toEqual([]);
  });
});

describe("extractAction guards", () => {
  async function runWith(url: (context: any) => string) {
    const action = {
      name: "list_orders",
      displayName: "List Orders",
      description: "List orders.",
      props: {},
      run: async (context: any) => {
        const { httpClient, HttpMethod } = await import("../shims/pieces-common");
        return httpClient.sendRequest({ method: HttpMethod.GET, url: url(context), headers: {} });
      },
    };
    return extractAction(action as never);
  }

  it("reaches a credential nested behind a custom-auth bundle", async () => {
    const extracted = await runWith((context) => `https://api.demo.test/v1/${context.auth.props.token}/orders`);
    expect(extracted.request).toBeDefined();
    expect((extracted.request as any).path).toContain("__AP_AUTH__");
  });

  it("refuses a per-tenant host that depends on a setup field", async () => {
    const extracted = await runWith((context) => `https://${context.auth.props.shopName}.myshopify.com/admin/orders.json`);
    expect(extracted.request).toBeUndefined();
    expect(extracted.review.join(" ")).toContain("host is not static");
  });

  it("refuses a URL with an unresolved segment", async () => {
    const extracted = await runWith((context) => `https://api.demo.test/v1/${context.propsValue.missing}/orders`);
    expect(extracted.request).toBeUndefined();
    expect(extracted.review.join(" ")).toContain("unresolved segment");
  });
});

describe("credential placement", () => {
  async function extract(build: (context: any) => Record<string, unknown>) {
    const action = {
      name: "list_cards",
      displayName: "List Cards",
      description: "List cards.",
      props: {},
      run: async (context: any) => {
        const { httpClient } = await import("../shims/pieces-common");
        return httpClient.sendRequest(build(context));
      },
    };
    return extractAction(action as never);
  }

  it("lifts a query-placed credential off the operation", async () => {
    const extracted = await extract((context) => ({
      method: "GET",
      url: "https://api.demo.test/1/cards",
      queryParams: { token: `${context.auth}`, fields: "all" },
    }));
    expect(extracted.authIn).toEqual({ in: "query", name: "token", value: "__AP_AUTH__" });
    expect((extracted.request as any).query).toEqual({ fields: "all" });
    expect(JSON.stringify(extracted.request)).not.toContain("__AP_");
  });

  it("refuses a provider that needs two credentials at once", async () => {
    const extracted = await extract((context) => ({
      method: "GET",
      url: "https://api.demo.test/1/cards",
      queryParams: { key: `${context.auth}`, token: `${context.auth}` },
    }));
    expect(extracted.authIn).toBeUndefined();
    expect(extracted.review.join(" ")).toContain("multi-field credential bundle");
  });
});
