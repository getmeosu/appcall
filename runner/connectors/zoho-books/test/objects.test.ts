import { describe, expect, it } from "bun:test";
import { normalizeInvoice, normalizeContact, normalizePayment, parseInvoicesResponse, parseContactsResponse, parsePaymentsResponse } from "../src/objects";

describe("Zoho Books objects", () => {
  it("normalizes an invoice", () => {
    const i = normalizeInvoice({ invoice_id: "inv-1", invoice_number: "INV-001", status: "paid", contact_name: "John", total: 1000, currency_code: "USD", date: "2024-01-15" });
    expect(i.id).toBe("inv-1");
    expect(i.provider).toBe("zoho-books");
    expect(i.invoiceNumber).toBe("INV-001");
    expect(i.total).toBe(1000);
  });

  it("normalizes a contact", () => {
    const c = normalizeContact({ contact_id: "cnt-1", contact_name: "John Doe", first_name: "John", last_name: "Doe", email: "john@test.com", is_customer: true, is_supplier: false });
    expect(c.id).toBe("cnt-1");
    expect(c.name).toBe("John Doe");
    expect(c.isCustomer).toBe(true);
    expect(c.isSupplier).toBe(false);
  });

  it("normalizes a payment", () => {
    const p = normalizePayment({ payment_id: "pay-1", invoice_id: "inv-1", customer_id: "cnt-1", amount: 500, currency_code: "USD", date: "2024-01-16", payment_mode: "bank_transfer", status: "success" });
    expect(p.id).toBe("pay-1");
    expect(p.amount).toBe(500);
    expect(p.paymentMode).toBe("bank_transfer");
  });

  it("parses invoices response", () => {
    const result = parseInvoicesResponse({ invoices: [{ invoice_id: "inv-1", invoice_number: "INV-001", status: "paid", total: 100, currency_code: "USD" }], page_context: { page: 1, has_more_page: false } });
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.page).toBe(1);
  });

  it("handles null input", () => {
    expect(parseInvoicesResponse(null).items).toHaveLength(0);
    expect(parseContactsResponse(null).items).toHaveLength(0);
    expect(parsePaymentsResponse(null).items).toHaveLength(0);
  });
});
