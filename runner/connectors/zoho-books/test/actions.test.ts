import { describe, expect, it } from "bun:test";
import {
  getContact,
  createContact,
  updateContact,
  deleteContact,
  getInvoice,
  createInvoice,
  updateInvoice,
  emailInvoice,
  voidInvoice,
  listBills,
  getBill,
  createBill,
  listItems,
  getItem,
  createItem,
  getOrganizations,
} from "../src/actions";
import contactGet from "../fixtures/contact_get.json";
import contactCreate from "../fixtures/contact_create.json";
import contactUpdate from "../fixtures/contact_update.json";
import contactDelete from "../fixtures/contact_delete.json";
import invoiceGet from "../fixtures/invoice_get.json";
import invoiceCreate from "../fixtures/invoice_create.json";
import invoiceUpdate from "../fixtures/invoice_update.json";
import invoiceEmail from "../fixtures/invoice_email.json";
import invoiceVoid from "../fixtures/invoice_void.json";
import billsList from "../fixtures/bills_list.json";
import billGet from "../fixtures/bill_get.json";
import billCreate from "../fixtures/bill_create.json";
import itemsList from "../fixtures/items_list.json";
import itemGet from "../fixtures/item_get.json";
import itemCreate from "../fixtures/item_create.json";
import organizationsGet from "../fixtures/organizations_get.json";
import organizationGet from "../fixtures/organization_get.json";

function createMockFetch(status: number, body: unknown, sink?: { requests: Request[] }) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    sink?.requests.push(new Request(input, init));
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

async function formPayload(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  return Object.fromEntries(new URLSearchParams(text));
}

const liveAuth = { accessToken: "test-token" };
const organizationId = "10234695";

describe("contacts.get", () => {
  it("requires organizationId and contactId", () => {
    expect(() => getContact({})).toThrow("organizationId is required");
    expect(() => getContact({ organizationId })).toThrow("contactId is required");
  });

  it("validates without credentials", () => {
    const result = getContact({ organizationId, contactId: "cnt-001" }) as any;
    expect(result.action).toBe("contacts.get");
    expect(result.validated.contactId).toBe("cnt-001");
  });

  it("fetches contact live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await getContact({
      ...liveAuth,
      organizationId,
      contactId: "cnt-001",
      fetch: createMockFetch(200, contactGet, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("GET");
    expect(sink.requests[0].url).toContain("/api/v3/contacts/cnt-001");
    expect(sink.requests[0].url).toContain(`organization_id=${organizationId}`);
    expect(result.contact.id).toBe("cnt-001");
    expect(result.contact.name).toBe("John Doe");
  });
});

describe("contacts.create", () => {
  it("requires organizationId and contactName", () => {
    expect(() => createContact({ organizationId })).toThrow("contactName is required");
  });

  it("posts JSONString contact create", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await createContact({
      ...liveAuth,
      organizationId,
      contactName: "Ada Lovelace",
      email: "ada@example.com",
      contactType: "customer",
      fetch: createMockFetch(200, contactCreate, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("POST");
    expect(sink.requests[0].url).toContain("/api/v3/contacts");
    const form = await formPayload(sink.requests[0]);
    expect(JSON.parse(form.JSONString)).toMatchObject({
      contact_name: "Ada Lovelace",
      email: "ada@example.com",
      contact_type: "customer",
    });
    expect(result.contact.id).toBe("cnt-003");
  });
});

describe("contacts.update", () => {
  it("puts JSONString contact update", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await updateContact({
      ...liveAuth,
      organizationId,
      contactId: "cnt-001",
      contactName: "John Doe LLC",
      fetch: createMockFetch(200, contactUpdate, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("PUT");
    expect(sink.requests[0].url).toContain("/api/v3/contacts/cnt-001");
    const form = await formPayload(sink.requests[0]);
    expect(JSON.parse(form.JSONString).contact_name).toBe("John Doe LLC");
    expect(result.contact.name).toBe("John Doe LLC");
  });
});

describe("contacts.delete", () => {
  it("deletes contact live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await deleteContact({
      ...liveAuth,
      organizationId,
      contactId: "cnt-001",
      fetch: createMockFetch(200, contactDelete, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("DELETE");
    expect(sink.requests[0].url).toContain("/api/v3/contacts/cnt-001");
    expect(result.deleted).toBe(true);
  });
});

describe("invoices.get", () => {
  it("requires organizationId and invoiceId", () => {
    expect(() => getInvoice({ organizationId })).toThrow("invoiceId is required");
  });

  it("fetches invoice live with mocked fetch", async () => {
    const result = (await getInvoice({
      ...liveAuth,
      organizationId,
      invoiceId: "inv-001",
      fetch: createMockFetch(200, invoiceGet),
    })) as any;
    expect(result.invoice.id).toBe("inv-001");
    expect(result.invoice.invoiceNumber).toBe("INV-2024-001");
    expect(result.invoice.total).toBe(1500);
  });
});

describe("invoices.create", () => {
  it("requires organizationId, customerId, and lineItems", () => {
    expect(() => createInvoice({ organizationId })).toThrow("customerId is required");
    expect(() => createInvoice({ organizationId, customerId: "cnt-003" })).toThrow(
      "lineItems is required",
    );
  });

  it("posts JSONString invoice create", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await createInvoice({
      ...liveAuth,
      organizationId,
      customerId: "cnt-003",
      lineItems: [{ name: "Onboarding package", rate: 250, quantity: 1 }],
      fetch: createMockFetch(200, invoiceCreate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/api/v3/invoices");
    const form = await formPayload(sink.requests[0]);
    expect(JSON.parse(form.JSONString)).toMatchObject({
      customer_id: "cnt-003",
      line_items: [{ name: "Onboarding package", rate: 250, quantity: 1 }],
    });
    expect(result.invoice.id).toBe("inv-003");
  });
});

describe("invoices.update", () => {
  it("puts JSONString invoice update", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await updateInvoice({
      ...liveAuth,
      organizationId,
      invoiceId: "inv-001",
      dueDate: "2024-02-28",
      fetch: createMockFetch(200, invoiceUpdate, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("PUT");
    expect(sink.requests[0].url).toContain("/api/v3/invoices/inv-001");
    expect(result.invoice.dueDate).toBe("2024-02-28");
  });
});

describe("invoices.email", () => {
  it("posts invoice email live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await emailInvoice({
      ...liveAuth,
      organizationId,
      invoiceId: "inv-001",
      toMailIds: ["john@example.com"],
      subject: "Invoice INV-2024-001",
      fetch: createMockFetch(200, invoiceEmail, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("POST");
    expect(sink.requests[0].url).toContain("/api/v3/invoices/inv-001/email");
    const form = await formPayload(sink.requests[0]);
    expect(JSON.parse(form.JSONString).to_mail_ids).toEqual(["john@example.com"]);
    expect(result.sent).toBe(true);
  });
});

describe("invoices.void", () => {
  it("posts invoice void live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await voidInvoice({
      ...liveAuth,
      organizationId,
      invoiceId: "inv-001",
      fetch: createMockFetch(200, invoiceVoid, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("POST");
    expect(sink.requests[0].url).toContain("/api/v3/invoices/inv-001/status/void");
    expect(result.voided).toBe(true);
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(
      voidInvoice({
        ...liveAuth,
        organizationId,
        invoiceId: "inv-001",
        fetch: createMockFetch(429, { code: 45, message: "rate limited" }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("bills.list", () => {
  it("requires organizationId", () => {
    expect(() => listBills({})).toThrow("organizationId is required");
  });

  it("lists bills live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await listBills({
      ...liveAuth,
      organizationId,
      page: 1,
      perPage: 200,
      fetch: createMockFetch(200, billsList, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/api/v3/bills");
    expect(result.bills).toHaveLength(2);
    expect(result.bills[0].id).toBe("bill-001");
    expect(result.bills[0].vendorName).toBe("Office Supplies Co");
    expect(result.hasMore).toBe(false);
  });
});

describe("bills.get", () => {
  it("fetches bill live with mocked fetch", async () => {
    const result = (await getBill({
      ...liveAuth,
      organizationId,
      billId: "bill-001",
      fetch: createMockFetch(200, billGet),
    })) as any;
    expect(result.bill.id).toBe("bill-001");
    expect(result.bill.billNumber).toBe("BILL-2024-001");
  });
});

describe("bills.create", () => {
  it("requires organizationId, vendorId, and lineItems", () => {
    expect(() => createBill({ organizationId })).toThrow("vendorId is required");
  });

  it("posts JSONString bill create", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await createBill({
      ...liveAuth,
      organizationId,
      vendorId: "vnd-001",
      lineItems: [{ name: "Stapler", rate: 45, quantity: 1 }],
      fetch: createMockFetch(200, billCreate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/api/v3/bills");
    const form = await formPayload(sink.requests[0]);
    expect(JSON.parse(form.JSONString).vendor_id).toBe("vnd-001");
    expect(result.bill.id).toBe("bill-003");
  });
});

describe("items.list", () => {
  it("lists items live with mocked fetch", async () => {
    const result = (await listItems({
      ...liveAuth,
      organizationId,
      fetch: createMockFetch(200, itemsList),
    })) as any;
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("item-001");
    expect(result.items[0].name).toBe("Consulting");
  });
});

describe("items.get", () => {
  it("fetches item live with mocked fetch", async () => {
    const result = (await getItem({
      ...liveAuth,
      organizationId,
      itemId: "item-001",
      fetch: createMockFetch(200, itemGet),
    })) as any;
    expect(result.item.id).toBe("item-001");
    expect(result.item.rate).toBe(1500);
  });
});

describe("items.create", () => {
  it("requires organizationId and name", () => {
    expect(() => createItem({ organizationId })).toThrow("name is required");
  });

  it("posts JSONString item create", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await createItem({
      ...liveAuth,
      organizationId,
      name: "Onboarding package",
      rate: 499,
      sku: "ONBOARD",
      fetch: createMockFetch(200, itemCreate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/api/v3/items");
    const form = await formPayload(sink.requests[0]);
    expect(JSON.parse(form.JSONString)).toMatchObject({
      name: "Onboarding package",
      rate: 499,
      sku: "ONBOARD",
    });
    expect(result.item.id).toBe("item-003");
  });
});

describe("organizations.get", () => {
  it("lists organizations without organizationId", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await getOrganizations({
      ...liveAuth,
      fetch: createMockFetch(200, organizationsGet, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/api/v3/organizations");
    expect(sink.requests[0].url).not.toContain("organization_id=");
    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].id).toBe("10234695");
    expect(result.organizations[0].name).toBe("Acme Books");
  });

  it("fetches a single organization when organizationId is set", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await getOrganizations({
      ...liveAuth,
      organizationId,
      fetch: createMockFetch(200, organizationGet, sink),
    })) as any;
    expect(sink.requests[0].url).toContain(`/api/v3/organizations/${organizationId}`);
    expect(result.organization.id).toBe("10234695");
    expect(result.organizations).toHaveLength(1);
  });
});
