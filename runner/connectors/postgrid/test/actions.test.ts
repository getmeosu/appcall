import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const mock = (body: unknown, status = 200) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
    calls.push({ url: String(u), init: i });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetch };
};

describe("postgrid declarative connector", () => {
  it("compiles every HTTP action including healthcheck", () => {
    expect(Object.keys(actions).length).toBe(61);
    expect(actions.healthcheck).toBeDefined();
    expect(actions["letters.create"]).toBeDefined();
    expect(actions["cheques.cancel_with_note"]).toBeDefined();
    expect(actions["return_envelope_orders.fill"]).toBeDefined();
  });

  it("healthchecks with x-api-key and wraps data", async () => {
    const m = mock({ object: "list", data: [] });
    const r = (await actions.healthcheck!({ apiKey: "secret", fetch: m.fetch })) as { data: unknown };
    expect(m.calls[0]?.url).toBe("https://api.postgrid.com/print-mail/v1/templates?limit=1");
    expect((m.calls[0]?.init?.headers as Record<string, string>)["x-api-key"] ?? (m.calls[0]?.init?.headers as Record<string, string>)["X-API-Key"]).toBe("secret");
    expect(r.data).toEqual({ object: "list", data: [] });
  });

  it("maps Composio fromAddress onto PostGrid from for letters", async () => {
    const m = mock({ id: "letter_1", object: "letter" }, 201);
    await actions["letters.create"]!({
      apiKey: "x",
      to: { firstName: "Kevin", lastName: "Villena", addressLine1: "1 Main", city: "NYC", provinceOrState: "NY", postalOrZip: "10001", countryCode: "US" },
      fromAddress: { companyName: "Acme", addressLine1: "2 Main", city: "BOS", provinceOrState: "MA", postalOrZip: "02114", countryCode: "US" },
      html: "<html>Hi</html>",
      fetch: m.fetch,
    });
    expect(m.calls[0]?.url).toBe("https://api.postgrid.com/print-mail/v1/letters");
    expect(m.calls[0]?.init?.method).toBe("POST");
    const body = JSON.parse(String(m.calls[0]?.init?.body));
    expect(body.from.companyName).toBe("Acme");
    expect(body.to.firstName).toBe("Kevin");
    expect(body.html).toBe("<html>Hi</html>");
    expect(body.fromAddress).toBeUndefined();
  });

  it("maps organization onto companyName for contacts.create", async () => {
    const m = mock({ id: "contact_1", object: "contact" }, 201);
    await actions["contacts.create"]!({
      apiKey: "x",
      firstName: "Kevin",
      lastName: "Villena",
      organization: "PostGrid",
      addressLine1: "145 Mulberry St",
      city: "New York",
      provinceOrState: "NY",
      postalOrZip: "10013",
      countryCode: "US",
      fetch: m.fetch,
    });
    const body = JSON.parse(String(m.calls[0]?.init?.body));
    expect(body.companyName).toBe("PostGrid");
    expect(body.organization).toBeUndefined();
  });

  it("cancels cheques with a note via /cancellation", async () => {
    const m = mock({ id: "cheque_1", status: "cancelled" });
    await actions["cheques.cancel_with_note"]!({ apiKey: "x", id: "cheque_1", note: "duplicate", fetch: m.fetch });
    expect(m.calls[0]?.url).toBe("https://api.postgrid.com/print-mail/v1/cheques/cheque_1/cancellation");
    expect(m.calls[0]?.init?.method).toBe("POST");
    expect(String(m.calls[0]?.init?.body)).toBe('{"note":"duplicate"}');
  });

  it("encodes path IDs and rejects missing input", async () => {
    const m = mock({ id: "a/b" });
    await actions["contacts.get"]!({ apiKey: "x", id: "a/b", fetch: m.fetch });
    expect(m.calls[0]?.url).toContain("/contacts/a%2Fb");
    await expect(actions["contacts.get"]!({ apiKey: "x", fetch: m.fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  it("progresses test boxes without a JSON body", async () => {
    const m = mock({ id: "box_1", status: "printing" });
    await actions["boxes.progress"]!({ apiKey: "x", id: "box_1", fetch: m.fetch });
    expect(m.calls[0]?.url).toBe("https://api.postgrid.com/print-mail/v1/boxes/box_1/progressions");
    expect(m.calls[0]?.init?.method).toBe("POST");
    expect(m.calls[0]?.init?.body ?? null).toBe(null);
  });
});
