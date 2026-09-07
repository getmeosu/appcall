import { describe, expect, test } from "bun:test";
import createContactFixture from "../fixtures/create_contact.json";
import { createContact, createLead, createOpportunity, createCase } from "../src/actions";

describe("salesforce connector actions", () => {
  test("createContact validates input without token", () => {
    const result = createContact({ lastName: "Smith", firstName: "Alice" });

    expect(result.source).toBe("connector");
    expect(result.connector).toBe("salesforce");
    expect(result.action).toBe("contacts.create");
    expect(result.validated.lastName).toBe("Smith");
  });

  test("createContact rejects invalid input", () => {
    expect(() => createContact("not object")).toThrow();
    expect(() => createContact({})).toThrow();
  });

  test("createContact posts to Salesforce API", async () => {
    const requests: Request[] = [];
    const result = await createContact({
      accessToken: "00D.test-token",
      instanceUrl: "https://org.my.salesforce.com",
      lastName: "Smith",
      firstName: "Alice",
      email: "alice@example.com",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify(createContactFixture), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://org.my.salesforce.com/services/data/v60.0/sobjects/Contact");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer 00D.test-token");
    expect(result.connector).toBe("salesforce");
    expect(result.action).toBe("contacts.create");
  });

  test("createLead validates input without token", () => {
    const result = createLead({ lastName: "Smith", company: "Acme" });

    expect(result.source).toBe("connector");
    expect(result.validated.lastName).toBe("Smith");
    expect(result.validated.company).toBe("Acme");
  });

  test("createLead posts to Salesforce API", async () => {
    const requests: Request[] = [];
    await createLead({
      accessToken: "00D.test-token",
      instanceUrl: "https://org.my.salesforce.com",
      lastName: "Williams",
      company: "Acme Corp",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ id: "00Q-new", success: true, errors: [] }), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/sobjects/Lead");
    expect(requests[0].method).toBe("POST");
  });

  test("createOpportunity validates input without token", () => {
    const result = createOpportunity({ name: "Deal", closeDate: "2026-06-30", stage: "Proposal" });

    expect(result.source).toBe("connector");
    expect(result.validated.name).toBe("Deal");
  });

  test("createOpportunity posts to Salesforce API", async () => {
    const requests: Request[] = [];
    await createOpportunity({
      accessToken: "00D.test-token",
      instanceUrl: "https://org.my.salesforce.com",
      name: "Enterprise Deal",
      closeDate: "2026-06-30",
      stage: "Proposal",
      amount: 100000,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ id: "006-new", success: true, errors: [] }), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/sobjects/Opportunity");
  });

  test("createCase validates input without token", () => {
    const result = createCase({ subject: "Bug report" });

    expect(result.source).toBe("connector");
    expect(result.validated.subject).toBe("Bug report");
  });

  test("createCase posts to Salesforce API", async () => {
    const requests: Request[] = [];
    await createCase({
      accessToken: "00D.test-token",
      instanceUrl: "https://org.my.salesforce.com",
      subject: "Login issue",
      priority: "High",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ id: "500-new", success: true, errors: [] }), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/sobjects/Case");
  });

  test("actions require both accessToken and instanceUrl for execution", () => {
    expect(() => createContact({ accessToken: "token" })).toThrow();
    expect(() => createLead({ instanceUrl: "https://org.salesforce.com" })).toThrow();
  });
});
