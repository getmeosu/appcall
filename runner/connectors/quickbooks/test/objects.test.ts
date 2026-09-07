import { describe, expect, test } from "bun:test";
import invoicesFixture from "../fixtures/invoices_list.json";
import customersFixture from "../fixtures/customers_list.json";
import paymentsFixture from "../fixtures/payments_list.json";
import {
  normalizeInvoice,
  normalizeCustomer,
  normalizePayment,
  parseInvoicesResponse,
  parseCustomersResponse,
  parsePaymentsResponse,
} from "../src/objects";
import { prop, propNum } from "../src/http";

describe("quickbooks objects - helpers", () => {
  test("prop extracts string from nested object", () => {
    expect(prop({ value: "USD" }, "value")).toBe("USD");
    expect(prop({ name: "Jane" }, "name")).toBe("Jane");
  });

  test("prop returns empty string for non-object or missing field", () => {
    expect(prop(null, "value")).toBe("");
    expect(prop("string", "value")).toBe("");
    expect(prop({ other: 123 }, "value")).toBe("");
    expect(prop({ value: 42 }, "value")).toBe("");
  });

  test("propNum extracts number from record", () => {
    expect(propNum({ TotalAmt: 100.50 }, "TotalAmt")).toBe(100.50);
    expect(propNum({ Balance: 0 }, "Balance")).toBe(0);
  });

  test("propNum returns 0 for non-object or missing field", () => {
    expect(propNum(null, "TotalAmt")).toBe(0);
    expect(propNum("string", "TotalAmt")).toBe(0);
    expect(propNum({ other: "abc" }, "TotalAmt")).toBe(0);
  });
});

describe("quickbooks objects - normalize invoice", () => {
  test("normalizes invoice from fixture", () => {
    const raw = invoicesFixture.Invoice[0];
    const inv = normalizeInvoice(raw);

    expect(inv.id).toBe("qb-inv:1");
    expect(inv.provider).toBe("quickbooks");
    expect(inv.docNumber).toBe("INV-001");
    expect(inv.totalAmt).toBe(100);
    expect(inv.currency).toBe("USD");
    expect(inv.status).toBe("Paid");
    expect(inv.customerName).toBe("Jane Doe");
    expect(inv.dueDate).toBe("2025-03-01");
    expect(inv.createdAt).toBe("2025-01-01T00:00:00Z");
    expect(inv.modelVersion).toBe("2026-05-16");
    expect(inv.raw).toBe(raw);
  });

  test("normalizes invoice with minimal fields", () => {
    const inv = normalizeInvoice({ Id: "42" });

    expect(inv.id).toBe("qb-inv:42");
    expect(inv.docNumber).toBe("");
    expect(inv.totalAmt).toBe(0);
    expect(inv.currency).toBe("");
    expect(inv.status).toBe("");
    expect(inv.customerName).toBe("");
    expect(inv.dueDate).toBe("");
    expect(inv.createdAt).toBe("");
  });
});

describe("quickbooks objects - normalize customer", () => {
  test("normalizes customer from fixture", () => {
    const raw = customersFixture.Customer[0];
    const cust = normalizeCustomer(raw);

    expect(cust.id).toBe("qb-cust:1");
    expect(cust.provider).toBe("quickbooks");
    expect(cust.displayName).toBe("Jane Doe");
    expect(cust.email).toBe("jane@example.com");
    expect(cust.balance).toBe(0);
    expect(cust.totalSales).toBe(5000);
    expect(cust.createdAt).toBe("2025-01-01T00:00:00Z");
    expect(cust.modelVersion).toBe("2026-05-16");
    expect(cust.raw).toBe(raw);
  });

  test("normalizes customer with minimal fields", () => {
    const cust = normalizeCustomer({ Id: "99" });

    expect(cust.id).toBe("qb-cust:99");
    expect(cust.displayName).toBe("");
    expect(cust.email).toBe("");
    expect(cust.balance).toBe(0);
    expect(cust.totalSales).toBe(0);
  });
});

describe("quickbooks objects - normalize payment", () => {
  test("normalizes payment from fixture", () => {
    const raw = paymentsFixture.Payment[0];
    const pay = normalizePayment(raw);

    expect(pay.id).toBe("qb-pay:1");
    expect(pay.provider).toBe("quickbooks");
    expect(pay.totalAmt).toBe(100);
    expect(pay.currency).toBe("USD");
    expect(pay.txnDate).toBe("2025-02-01");
    expect(pay.paymentMethod).toBe("Credit Card");
    expect(pay.customerName).toBe("Jane Doe");
    expect(pay.createdAt).toBe("2025-02-01T00:00:00Z");
    expect(pay.modelVersion).toBe("2026-05-16");
    expect(pay.raw).toBe(raw);
  });

  test("normalizes payment with minimal fields", () => {
    const pay = normalizePayment({ Id: "7" });

    expect(pay.id).toBe("qb-pay:7");
    expect(pay.totalAmt).toBe(0);
    expect(pay.currency).toBe("");
    expect(pay.txnDate).toBe("");
    expect(pay.paymentMethod).toBe("");
    expect(pay.customerName).toBe("");
  });
});

describe("quickbooks objects - parse responses", () => {
  test("parses invoices list response", () => {
    const parsed = parseInvoicesResponse(invoicesFixture);

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].Id).toBe("1");
    expect(parsed.totalCount).toBe(1);
    expect(parsed.maxResults).toBe(100);
    expect(parsed.startIndex).toBe(1);
    expect(parsed.hasMore).toBe(false);
  });

  test("parses customers list response", () => {
    const parsed = parseCustomersResponse(customersFixture);

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].Id).toBe("1");
    expect(parsed.totalCount).toBe(1);
    expect(parsed.hasMore).toBe(false);
  });

  test("parses payments list response", () => {
    const parsed = parsePaymentsResponse(paymentsFixture);

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].Id).toBe("1");
    expect(parsed.totalCount).toBe(1);
    expect(parsed.hasMore).toBe(false);
  });

  test("parses paginated response where hasMore is true", () => {
    const pagedResponse = {
      Invoice: [{ Id: "1", DocNumber: "INV-001" }],
      totalCount: 150,
      maxResults: 100,
      startIndex: 1,
    };
    const parsed = parseInvoicesResponse(pagedResponse);

    expect(parsed.hasMore).toBe(true);
    expect(parsed.totalCount).toBe(150);
    expect(parsed.maxResults).toBe(100);
    expect(parsed.startIndex).toBe(1);
  });

  test("parses second page where hasMore is false", () => {
    const secondPage = {
      Invoice: [{ Id: "101", DocNumber: "INV-101" }],
      totalCount: 150,
      maxResults: 100,
      startIndex: 101,
    };
    const parsed = parseInvoicesResponse(secondPage);

    expect(parsed.hasMore).toBe(false);
    expect(parsed.startIndex).toBe(101);
  });

  test("handles non-object response gracefully", () => {
    expect(parseInvoicesResponse(null)).toEqual({ items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false });
    expect(parseInvoicesResponse("string")).toEqual({ items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false });
    expect(parseCustomersResponse(null)).toEqual({ items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false });
    expect(parsePaymentsResponse(null)).toEqual({ items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false });
  });

  test("handles response with missing array", () => {
    expect(parseInvoicesResponse({ totalCount: 0 })).toEqual({ items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false });
  });

  test("handles empty array in response", () => {
    const parsed = parseInvoicesResponse({ Invoice: [], totalCount: 0, maxResults: 100, startIndex: 1 });
    expect(parsed.items).toHaveLength(0);
    expect(parsed.hasMore).toBe(false);
  });
});
