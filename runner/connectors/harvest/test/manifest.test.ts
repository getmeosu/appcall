import { expect, test } from "bun:test";
import manifest from "../manifest.json";
import contracts from "../fixtures/contracts.json";

const COMPOSIO_OPS = [
  "clients.create",
  "contacts.create",
  "estimates.create",
  "estimateItemCategories.create",
  "estimateMessages.create",
  "expenses.create",
  "invoices.create",
  "invoiceItemCategories.create",
  "invoiceMessages.create",
  "invoicePayments.create",
  "projects.create",
  "tasks.create",
  "timeEntries.create",
  "users.create",
  "clients.delete",
  "contacts.delete",
  "estimates.delete",
  "estimateMessages.delete",
  "invoices.delete",
  "invoiceItemCategories.delete",
  "invoiceMessages.delete",
  "invoicePayments.delete",
  "projects.delete",
  "tasks.delete",
  "timeEntries.delete",
  "users.delete",
  "clients.get",
  "company.get",
  "estimates.get",
  "invoices.get",
  "projects.get",
  "tasks.get",
  "timeEntries.get",
  "users.get",
  "contacts.list",
  "clients.list",
  "estimateMessages.list",
  "expenseCategories.list",
  "invoiceItemCategories.list",
  "invoiceMessages.list",
  "invoicePayments.list",
  "invoices.list",
  "projects.list",
  "tasks.list",
  "timeEntries.list",
  "users.list",
  "clients.update",
  "contacts.update",
  "company.update",
  "estimates.update",
  "estimateItemCategories.update",
  "expenses.update",
  "invoices.update",
  "projects.update",
  "tasks.update",
  "timeEntries.update",
  "users.update"
];

test("has complete declarative contracts for every Composio tool", () => {
  expect(manifest.key).toBe("harvest");
  expect(manifest.version).toBe("0.2.0");
  expect(manifest.auth.setup.fields.find((f: { secret?: boolean }) => f.secret)?.key).toBe(manifest.http.auth.field);
  expect(manifest.network.allowedHosts).toContain(new URL(manifest.http.baseUrl).hostname);
  expect(Object.keys(manifest.operations).sort()).toEqual((contracts as Array<{ op: string }>).map((c) => c.op).sort());
  expect(Object.keys(manifest.operations)).toHaveLength(59);
  for (const toolOp of COMPOSIO_OPS) {
    expect(manifest.operations[toolOp as keyof typeof manifest.operations]).toBeDefined();
  }
  for (const [key, op] of Object.entries(manifest.operations) as [string, Record<string, unknown>][]) {
    expect(op.kind).toBe("action");
    expect(String(op.title).length).toBeGreaterThan(0);
    expect(String(op.description).length).toBeGreaterThan(10);
    expect((op.inputSchema as { type: string }).type).toBe("object");
    expect(Number(op.timeoutMs)).toBeGreaterThan(0);
    const request = op.request as { method?: string; path?: string };
    expect(request.method).toBeTruthy();
    expect(request.path).toBeTruthy();
    expect(["read", "write", "destructive"]).toContain(op.sideEffect);
    if (key.startsWith("webhook.")) expect(op.sideEffect).toBe("read");
  }
});
