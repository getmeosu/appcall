import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = [
  ["account.get", "GET", "/get-account-info"],
  ["editor-sessions.create", "POST", "/create-editor-session"],
  ["pdf.add-text", "POST", "/add-text-to-pdf"],
  ["pdf.add-watermark", "POST", "/add-watermark"],
  ["pdf.create-async", "POST", "/create-async"],
  ["pdf.create-parallel", "POST", "/create-parallel"],
  ["pdf.get-info", "GET", "/get-pdf-info"],
  ["pdf.merge", "POST", "/merge-pdfs"],
  ["pdf.update-fields", "POST", "/update-pdf-fields"],
  ["templates.list", "GET", "/list-templates"],
  ["templates.query-usage", "GET", "/query-template-usage"],
  ["transactions.list", "GET", "/list-transactions"],
] as const;

test("CraftMyPDF manifest keeps one strict JSON operation per live tool", () => {
  expect(Object.keys(manifest.operations).sort()).toEqual(operations.map(([key]) => key).sort());
  for (const [key, method, path] of operations) {
    const operation = manifest.operations[key];
    expect(operation.request.method, key).toBe(method);
    expect(operation.request.path, key).toBe(path);
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.inputSchema.type, key).toBe("object");
  }
});
