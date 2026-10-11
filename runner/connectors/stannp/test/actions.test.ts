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

describe("stannp declarative connector", () => {
  it("compiles every HTTP action including healthcheck", () => {
    expect(Object.keys(actions).length).toBe(34);
    expect(actions.healthcheck).toBeDefined();
    expect(actions["letters.create"]).toBeDefined();
    expect(actions["postcards.create"]).toBeDefined();
    expect(actions["pdfs.merge"]).toBeDefined();
    expect(actions["groups.recipients.add"]).toBeDefined();
  });

  it("healthchecks with basic auth on the regional host and wraps data", async () => {
    const m = mock({ success: true, data: { balance: "10.00" } });
    const r = (await actions.healthcheck!({ apiKey: "secret", region: "eu", fetch: m.fetch })) as { data: unknown };
    expect(m.calls[0]?.url).toBe("https://api-eu1.stannp.com/v1/accounts/balance");
    expect((m.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("secret:", "utf8").toString("base64")}`);
    expect(r.data).toEqual({ success: true, data: { balance: "10.00" } });
  });

  it("maps first_name onto firstname when adding a recipient to a group", async () => {
    const m = mock({ success: true, data: { id: "1941", valid: true } });
    await actions["recipients.create"]!({
      apiKey: "x",
      region: "us",
      group_id: "1",
      first_name: "John",
      last_name: "Smith",
      address1: "123 Main Street",
      city: "New York",
      postcode: "10001",
      country: "US",
      fetch: m.fetch,
    });
    expect(m.calls[0]?.url).toBe("https://api-us1.stannp.com/v1/recipients/new");
    expect(m.calls[0]?.init?.method).toBe("POST");
    const body = String(m.calls[0]?.init?.body);
    expect(body).toContain("firstname=John");
    expect(body).toContain("lastname=Smith");
    expect(body).not.toContain("first_name=");
  });

  it("flattens postcard recipient objects onto recipient[field] form keys", async () => {
    const m = mock({ success: true, data: { id: 0, status: "test" } });
    await actions["postcards.create"]!({
      apiKey: "x",
      region: "us",
      size: "4x6",
      test: true,
      recipient: {
        firstname: "John",
        lastname: "Smith",
        address1: "123 Sample Street",
        city: "Sampletown",
        zipcode: "12345",
        country: "US",
      },
      fetch: m.fetch,
    });
    const body = String(m.calls[0]?.init?.body);
    expect(body).toContain("size=4x6");
    expect(body).toContain("test=true");
    expect(body).toContain("recipient%5Bfirstname%5D=John");
    expect(body).toContain("recipient%5Bzipcode%5D=12345");
  });

  it("merges PDF URLs as files[n] form fields", async () => {
    const m = mock({ success: true, data: "https://merged-file.pdf" });
    await actions["pdfs.merge"]!({
      apiKey: "x",
      region: "us",
      files: ["https://file1.pdf", "https://file2.pdf"],
      fetch: m.fetch,
    });
    expect(m.calls[0]?.url).toBe("https://api-us1.stannp.com/v1/pdf/merge");
    expect(String(m.calls[0]?.init?.body)).toBe("files%5B0%5D=https%3A%2F%2Ffile1.pdf&files%5B1%5D=https%3A%2F%2Ffile2.pdf");
  });

  it("rejects missing required input and unknown regions", async () => {
    await expect(actions["contacts.get"]!({ apiKey: "x", region: "us", fetch: mock({}).fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions.healthcheck!({ apiKey: "x", region: "x", fetch: mock({}).fetch })).rejects.toMatchObject({
      code: "OUTBOUND_HOST_NOT_ALLOWED",
    });
  });
});
