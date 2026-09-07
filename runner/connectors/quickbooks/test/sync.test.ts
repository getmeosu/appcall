import { describe, expect, test } from "bun:test";
import invoicesFixture from "../fixtures/invoices_list.json";
import customersFixture from "../fixtures/customers_list.json";
import paymentsFixture from "../fixtures/payments_list.json";
import {
  executeInvoicesListSync,
  executeCustomersListSync,
  executePaymentsListSync,
} from "../src/sync";

describe("quickbooks sync operations", () => {
  test("invoices.list sync parses and normalizes invoices", () => {
    const result = executeInvoicesListSync({ response: invoicesFixture });

    expect(result.provider).toBe("quickbooks");
    expect(result.operation).toBe("invoices.list");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("qb-inv:1");
    expect(result.items[0].docNumber).toBe("INV-001");
    expect(result.items[0].totalAmt).toBe(100);
    expect(result.items[0].currency).toBe("USD");
    expect(result.items[0].status).toBe("Paid");
    expect(result.items[0].customerName).toBe("Jane Doe");
    expect(result.items[0].dueDate).toBe("2025-03-01");
    expect(result.hasMore).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.maxResults).toBe(100);
    expect(result.startIndex).toBe(1);
  });

  test("customers.list sync parses and normalizes customers", () => {
    const result = executeCustomersListSync({ response: customersFixture });

    expect(result.provider).toBe("quickbooks");
    expect(result.operation).toBe("customers.list");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("qb-cust:1");
    expect(result.items[0].displayName).toBe("Jane Doe");
    expect(result.items[0].email).toBe("jane@example.com");
    expect(result.items[0].balance).toBe(0);
    expect(result.items[0].totalSales).toBe(5000);
    expect(result.hasMore).toBe(false);
  });

  test("payments.list sync parses and normalizes payments", () => {
    const result = executePaymentsListSync({ response: paymentsFixture });

    expect(result.provider).toBe("quickbooks");
    expect(result.operation).toBe("payments.list");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("qb-pay:1");
    expect(result.items[0].totalAmt).toBe(100);
    expect(result.items[0].currency).toBe("USD");
    expect(result.items[0].txnDate).toBe("2025-02-01");
    expect(result.items[0].paymentMethod).toBe("Credit Card");
    expect(result.items[0].customerName).toBe("Jane Doe");
    expect(result.hasMore).toBe(false);
  });

  test("invoices.list sync handles empty response", () => {
    const result = executeInvoicesListSync({ response: { Invoice: [], totalCount: 0, maxResults: 100, startIndex: 1 } });

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  test("customers.list sync handles empty response", () => {
    const result = executeCustomersListSync({ response: { Customer: [], totalCount: 0 } });

    expect(result.items).toHaveLength(0);
  });

  test("payments.list sync handles empty response", () => {
    const result = executePaymentsListSync({ response: { Payment: [], totalCount: 0 } });

    expect(result.items).toHaveLength(0);
  });

  test("all syncs throw on non-object response", () => {
    expect(() => executeInvoicesListSync({ response: "bad" })).toThrow("response must be an object");
    expect(() => executeCustomersListSync({ response: null })).toThrow("response must be an object");
    expect(() => executePaymentsListSync({ response: [] })).toThrow("response must be an object");
  });
});
