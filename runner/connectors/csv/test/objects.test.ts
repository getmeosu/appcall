import { describe, expect, it } from "bun:test";
import { normalizeRow, parseCsvRows } from "../src/objects";

describe("normalizeRow", () => {
  it("maps fields with default id prefix", () => {
    const row = normalizeRow(0, { name: "Alice", age: "30" });
    expect(row.id).toBe("csv-row:0");
    expect(row.provider).toBe("csv");
    expect(row.rowIndex).toBe(0);
    expect(row.values).toEqual({ name: "Alice", age: "30" });
    expect(row.raw).toEqual({ name: "Alice", age: "30" });
  });

  it("uses custom id prefix", () => {
    const row = normalizeRow(5, { col: "val" }, "import");
    expect(row.id).toBe("import:5");
    expect(row.rowIndex).toBe(5);
  });

  it("does not mutate input", () => {
    const input: Record<string, string> = { a: "1" };
    const row = normalizeRow(0, input);
    input["b"] = "2";
    expect(row.values).toEqual({ a: "1" });
  });
});

describe("parseCsvRows", () => {
  it("parses a simple CSV with header and data rows", () => {
    const csv = "name,email\nAlice,alice@example.com\nBob,bob@example.com";
    const rows = parseCsvRows(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("csv-row:0");
    expect(rows[0].rowIndex).toBe(0);
    expect(rows[0].values).toEqual({ name: "Alice", email: "alice@example.com" });

    expect(rows[1].id).toBe("csv-row:1");
    expect(rows[1].values).toEqual({ name: "Bob", email: "bob@example.com" });
  });

  it("handles quoted fields", () => {
    const csv = 'name,description\nAlice,"has a comma, here"';
    const rows = parseCsvRows(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].values.name).toBe("Alice");
    expect(rows[0].values.description).toBe("has a comma, here");
  });

  it("handles escaped quotes inside quoted fields", () => {
    const csv = 'text\n"she said ""hello"" to me"';
    const rows = parseCsvRows(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].values.text).toBe('she said "hello" to me');
  });

  it("returns empty for empty string", () => {
    expect(parseCsvRows("")).toEqual([]);
    expect(parseCsvRows("   ")).toEqual([]);
  });

  it("returns empty when only a header row is provided", () => {
    const csv = "name,email";
    expect(parseCsvRows(csv)).toEqual([]);
  });

  it("handles \\r\\n line endings", () => {
    const csv = "a,b\r\n1,2\r\n3,4";
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].values).toEqual({ a: "1", b: "2" });
    expect(rows[1].values).toEqual({ a: "3", b: "4" });
  });

  it("handles missing columns by filling empty strings", () => {
    const csv = "a,b,c\n1";
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].values).toEqual({ a: "1", b: "", c: "" });
  });
});
