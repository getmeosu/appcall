import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { existsSync, readFileSync } from "node:fs";
import { handwrittenActions } from "../src/actions";
import manifest from "../manifest.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/brex/recipe.json";
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const handwritten = new Set(Object.keys(handwrittenActions));

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "budgetPrograms.list",
  "budgets.archive",
  "budgets.create",
  "budgets.get",
  "budgets.list",
  "budgets.update",
  "card.statements.list",
  "cardAccounts.list",
  "cardExpenses.get",
  "cards.create",
  "cards.get",
  "cards.limits.update",
  "cards.list",
  "cards.pan.get",
  "cards.transfer",
  "cards.update_status",
  "cash.accounts.list",
  "cash.statements.list",
  "company.get",
  "departments.create",
  "departments.get",
  "departments.list",
  "expenses.create",
  "expenses.get",
  "expenses.list",
  "expenses.update",
  "fieldValues.create",
  "fieldValues.delete",
  "fieldValues.get",
  "fieldValues.list",
  "fieldValues.update",
  "fields.create",
  "fields.delete",
  "fields.get",
  "fields.update",
  "healthcheck",
  "legalEntities.get",
  "legalEntities.list",
  "locations.create",
  "locations.get",
  "locations.list",
  "receipts.match",
  "receipts.upload",
  "referrals.create",
  "referrals.documents.create",
  "referrals.get",
  "referrals.list",
  "spendLimits.archive",
  "spendLimits.create",
  "spendLimits.get",
  "spendLimits.list",
  "spendLimits.update",
  "spendLimits.v1.create",
  "spendLimits.v1.update",
  "titles.create",
  "titles.get",
  "titles.list",
  "transactions.card.primary.list",
  "transactions.get",
  "transactions.list",
  "transactions.list.by_amount",
  "transactions.list.by_description",
  "transfers.list",
  "trips.list",
  "users.create",
  "users.get",
  "users.limit.get",
  "users.limit.set",
  "users.list",
  "users.update",
  "vendors.create",
  "vendors.delete",
  "vendors.get",
  "vendors.list",
  "vendors.update",
  "webhookGroups.create",
  "webhookGroups.get",
  "webhookGroups.list",
  "webhookGroups.members.add",
  "webhookGroups.members.list",
  "webhooks.create",
  "webhooks.get",
  "webhooks.list",
  "webhooks.secrets.list",
  "webhooks.update",
];

// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = ["cards.terminate", "cards.unlock"];

describe("brex manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("brex");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.brex.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.network.allowedHosts).toEqual(["api.brex.com"]);
  });

  it("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipeOps).toHaveLength(87);
    expect(runnerOps).toEqual(recipeOps);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  it("gives every action a title, description, object inputSchema, and request or handwritten handler", () => {
    expect(Object.keys(operations).length).toBe(87);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
      if (!handwritten.has(key)) {
        expect(operation.request, `${key} must declare a request block`).toBeDefined();
        expect((operation.request as { path?: string }).path, key).toBeDefined();
      }
    }
  });

  it("adds body-less unlock and JSON terminate beside lock", () => {
    const lock = operations["cards.update_status"]!;
    const unlock = operations["cards.unlock"]!;
    const terminate = operations["cards.terminate"]!;
    expect((lock.request as { path: string }).path).toBe("/v2/cards/{{card_id}}/lock");
    expect(unlock.sideEffect).toBe("write");
    expect(terminate.sideEffect).toBe("write");
    expect(unlock.timeoutMs).toBe(lock.timeoutMs);
    expect(unlock.maxInputBytes).toBe(lock.maxInputBytes);
    expect(unlock.maxResponseBytes).toBe(lock.maxResponseBytes);
    expect(terminate.timeoutMs).toBe(lock.timeoutMs);
    expect(terminate.maxInputBytes).toBe(lock.maxInputBytes);
    expect(terminate.maxResponseBytes).toBe(lock.maxResponseBytes);
    expect(unlock.outputSchema).toEqual(lock.outputSchema);
    expect(terminate.outputSchema).toEqual(lock.outputSchema);
    expect(unlock.responseFormat).toBe("json");
    expect(terminate.responseFormat).toBe("json");
    expect(unlock.validationMode).toBe("strict-generated");
    expect(terminate.validationMode).toBe("strict-generated");
    expect(unlock.enforceOutputSchema).toBe(true);
    expect(terminate.enforceOutputSchema).toBe(true);
    const unlockRequest = unlock.request as {
      method: string;
      path: string;
      baseUrl?: string;
      success: number[];
      body?: unknown;
      headers?: Record<string, string>;
    };
    const terminateRequest = terminate.request as {
      method: string;
      path: string;
      baseUrl?: string;
      success: number[];
      body?: unknown;
      headers?: Record<string, string>;
    };
    expect(unlockRequest).toEqual({
      method: "POST",
      path: "/v2/cards/{{card_id}}/unlock",
      success: [200],
      headers: { "Idempotency-Key": "{{idempotency_key}}" },
    });
    expect(unlockRequest.baseUrl).toBeUndefined();
    expect(unlockRequest.body).toBeUndefined();
    expect(terminateRequest).toEqual({
      method: "POST",
      path: "/v2/cards/{{card_id}}/terminate",
      success: [200],
      body: { reason: "{{reason}}", description: "{{description}}" },
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "{{idempotency_key}}",
      },
    });
    expect(terminateRequest.baseUrl).toBeUndefined();
    const unlockSchema = unlock.inputSchema as { type: string; additionalProperties: boolean; required: string[] };
    const terminateSchema = terminate.inputSchema as {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: { reason: { enum: string[] } };
    };
    expect(unlockSchema.type).toBe("object");
    expect(unlockSchema.additionalProperties).toBe(false);
    expect(unlockSchema.required).toEqual(["card_id"]);
    expect(terminateSchema.type).toBe("object");
    expect(terminateSchema.additionalProperties).toBe(false);
    expect(terminateSchema.required).toEqual(["card_id", "reason"]);
    expect(terminateSchema.properties.reason.enum).toEqual([
      "CARD_DAMAGED",
      "CARD_LOST",
      "CARD_NOT_RECEIVED",
      "DO_NOT_NEED_PHYSICAL_CARD",
      "DO_NOT_NEED_VIRTUAL_CARD",
      "FRAUD",
      "OTHER",
    ]);
  });

  it("compiles declarative operations and overlays handwritten handlers", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    const merged = { ...compiled.actions, ...handwrittenActions };
    expect(Object.keys(merged).sort()).toEqual(Object.keys(operations).sort());
  });
});
