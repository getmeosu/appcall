import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { convert } from "../convert";
import { reviewedAdapters } from "../adapters";
import type { StaticProvider } from "../static-parser";
import type { DeclarativeManifest } from "../../../../runner/bun/src/declarative/types";
const codaIds = ["healthcheck", "docs.list", "docs.get", "pages.list", "tables.list", "columns.list", "rows.list"] as const;
const helpScoutIds = ["healthcheck", "users.list", "inboxes.list", "tags.list", "conversations.list", "conversations.get", "threads.list"] as const;
const methodCases = [
  ["attio", "list_records", "records.list", "POST"],
  ["canny", "list_boards", "boards.list", "POST"],
  ["mixpanel", "list_saved_cohorts", "cohorts.list", "POST"],
] as const;
async function template(provider: string) { return JSON.parse(await readFile(`runner/connectors/${provider}/manifest.json`, "utf8")) as DeclarativeManifest; }
function provider(id: string, upstream: string[]): StaticProvider { return { id, displayName: id, actions: upstream.map(actionId => ({ id: actionId, description: actionId, requiredScopes: [], source: { path: "actions.ts" } })) }; }
function adapters(id: string) { return reviewedAdapters.filter(a => a.providerId === id); }
const clone = <T>(value: T): T => structuredClone(value);
describe("reviewed OpenConnector conversion", () => {
  test.each(methodCases)("accepts the reviewed %s operation method %s", async (id, upstream, operationId, method) => {
    const input = await template(id);
    const result = await convert(provider(id, [upstream]), adapters(id), [operationId], { [id]: input });
    expect(result.holds).toEqual([]);
    expect(result.manifest?.operations?.[operationId]?.request?.method).toBe(method);
  });

  test.each(methodCases)("rejects an absent or mismatched reviewed method for %s", async (id, upstream, operationId, method) => {
    const input = await template(id);
    delete (input.operations as any)[operationId];
    const absent = await convert(provider(id, [upstream]), adapters(id), [operationId], { [id]: input });
    expect(absent.manifest).toBeUndefined();
    expect(absent.holds.some((hold) => hold.code === "UNSAFE_TEMPLATE")).toBe(true);
    const mismatched = await template(id);
    (mismatched.operations as any)[operationId].request.method = method === "GET" ? "POST" : "GET";
    const result = await convert(provider(id, [upstream]), adapters(id), [operationId], { [id]: mismatched });
    expect(result.manifest).toBeUndefined();
    expect(result.holds.some((hold) => hold.code === "UNSAFE_TEMPLATE")).toBe(true);
  });

  test("converts every approved Coda operation and preserves the checked template", async () => {
    const input = await template("coda"); const before = clone(input);
    const result = await convert(provider("coda", ["get_current_user", "list_docs", "get_doc", "list_pages", "list_tables", "list_columns", "list_rows"]), adapters("coda"), codaIds, { coda: input });
    expect(result.holds).toEqual([]); expect(result.manifest?.operations).toEqual(Object.fromEntries(codaIds.map(id => [id, input.operations[id]]))); expect(input).toEqual(before);
  });
  test("converts Help Scout's seven operations, retaining both list_users mappings", async () => {
    const input = await template("helpscout"); const before = clone(input);
    const result = await convert(provider("helpscout", ["list_users", "list_inboxes", "list_tags", "list_conversations", "get_conversation", "list_threads"]), adapters("helpscout"), helpScoutIds, { helpscout: input });
    expect(result.holds).toEqual([]); expect(Object.keys(result.manifest?.operations ?? {}).sort()).toEqual([...helpScoutIds].sort()); expect(result.manifest?.operations?.["healthcheck"]?.request?.path).toBe("/users"); expect(result.manifest?.operations?.["users.list"]?.request?.path).toBe("/users"); expect(input).toEqual(before);
  });
  test("holds unknown, partial, dynamic and duplicate selections without a manifest", async () => {
    const t = await template("coda"); const p = provider("coda", ["get_current_user", "list_docs"]);
    for (const selected of [["missing"], ["docs.list", "missing"]] as const) { const result = await convert(p, adapters("coda"), selected, { coda: t }); expect(result.manifest).toBeUndefined(); expect(result.holds.length).toBeGreaterThan(0); }
    const duplicate = await convert(p, [...adapters("coda"), { ...adapters("coda")[0]!, appcallOperationId: "docs.list" }], ["docs.list"], { coda: t }); expect(duplicate.manifest).toBeUndefined(); expect(duplicate.holds.some(h => h.code === "DUPLICATE_MAPPING")).toBe(true);
    const dynamic = await convert({ ...p, actions: p.actions.filter(a => a.id !== "list_docs") }, adapters("coda"), ["docs.list"], { coda: t }); expect(dynamic.manifest).toBeUndefined(); expect(dynamic.holds.some(h => h.code === "UNSAFE_TEMPLATE")).toBe(true);
  });
  test.each([["key", "other"], ["runtime", "node"], ["models", []], ["http", { baseUrl: "https://evil.example" }]])("holds invalid template %s", async (field, value) => { const t = await template("coda"); (t as any)[field] = value; const result = await convert(provider("coda", ["get_current_user"]), adapters("coda"), ["healthcheck"], { coda: t }); expect(result.manifest).toBeUndefined(); expect(result.holds[0]?.code).toBe("INVALID_TEMPLATE"); });
  test.each(["path", "method", "success", "timeoutMs", "maxInputBytes", "maxResponseBytes"])("holds unsafe operation %s", async field => { const t = await template("coda"); const op: any = t.operations.healthcheck; if (field === "path") op.request.path = "//private.example/x"; else if (field === "method") op.request.method = "POST"; else if (field === "success") op.request.success = [202]; else op[field] = Number.NaN; const result = await convert(provider("coda", ["get_current_user"]), adapters("coda"), ["healthcheck"], { coda: t }); expect(result.manifest).toBeUndefined(); expect(result.holds[0]?.code).toBe("UNSAFE_TEMPLATE"); });
  test.each(["inputSchema", "outputSchema"])("holds missing or null %s", async field => { const t = await template("coda"); const op: any = t.operations.healthcheck; delete op[field]; const missing = await convert(provider("coda", ["get_current_user"]), adapters("coda"), ["healthcheck"], { coda: t }); expect(missing.manifest).toBeUndefined(); expect(missing.holds[0]?.code).toBe("UNSAFE_TEMPLATE"); op[field] = null; const nil = await convert(provider("coda", ["get_current_user"]), adapters("coda"), ["healthcheck"], { coda: t }); expect(nil.manifest).toBeUndefined(); expect(nil.holds[0]?.code).toBe("UNSAFE_TEMPLATE"); });
  test("holds disabled output enforcement and invalid auth contract", async () => { const t = await template("coda"); const op: any = t.operations.healthcheck; op.enforceOutputSchema = false; let result = await convert(provider("coda", ["get_current_user"]), adapters("coda"), ["healthcheck"], { coda: t }); expect(result.manifest).toBeUndefined(); expect(["UNSAFE_TEMPLATE", "INVALID_TEMPLATE"]).toContain(result.holds[0]?.code); const valid = await template("coda"); (valid as any).auth = null; result = await convert(provider("coda", ["get_current_user"]), adapters("coda"), ["healthcheck"], { coda: valid }); expect(result.manifest).toBeUndefined(); expect(["UNSAFE_TEMPLATE", "INVALID_TEMPLATE"]).toContain(result.holds[0]?.code); });
});
