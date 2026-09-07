import { describe, expect, test } from "bun:test";
import rowsFixture from "../fixtures/sheets_rows.json";
import worksheetsFixture from "../fixtures/sheets_worksheets.json";
import appendFixture from "../fixtures/sheets_append.json";
import {
  parseRowsResponse,
  parseWorksheetsResponse,
  validateGetValuesInput,
  validateAppendValuesInput,
  createSheetsClient,
} from "../src/sheets";
import { getSheetValues, appendSheetValues } from "../src/actions";

describe("google-workspace sheets", () => {
  test("parses rows response from fixture", () => {
    const result = parseRowsResponse(rowsFixture, "sheet123", "Sheet1");

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({ id: "sheet123_Sheet1_1", rowIndex: 1, values: ["Name", "Email", "Role"] });
    expect(result.rows[1]).toEqual({ id: "sheet123_Sheet1_2", rowIndex: 2, values: ["Alice", "alice@example.com", "Admin"] });
    expect(result.rows[2]).toEqual({ id: "sheet123_Sheet1_3", rowIndex: 3, values: ["Bob", "bob@example.com", "Viewer"] });
  });

  test("handles empty rows response", () => {
    const result = parseRowsResponse({ values: [] }, "sheet123", "Sheet1");
    expect(result.rows).toHaveLength(0);
  });

  test("parses worksheets response from fixture", () => {
    const result = parseWorksheetsResponse(worksheetsFixture);

    expect(result.worksheets).toHaveLength(2);
    expect(result.worksheets[0].id).toBe("0");
    expect(result.worksheets[0].title).toBe("Sheet1");
    expect(result.worksheets[0].spreadsheetId).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
    expect(result.worksheets[0].rowCount).toBe(1000);
    expect(result.worksheets[0].columnCount).toBe(26);
    expect(result.worksheets[1].id).toBe("12345");
    expect(result.worksheets[1].title).toBe("Summary");
    expect(result.worksheets[1].hidden).toBe(true);
  });

  test("validates get values input", () => {
    expect(validateGetValuesInput({ spreadsheetId: "abc", range: "Sheet1!A1:C3" })).toEqual({
      spreadsheetId: "abc",
      range: "Sheet1!A1:C3",
    });
    expect(() => validateGetValuesInput({})).toThrow();
    expect(() => validateGetValuesInput("not an object")).toThrow();
  });

  test("validates append values input", () => {
    expect(validateAppendValuesInput({ spreadsheetId: "abc", range: "Sheet1!A1", values: [["a", "b"]] })).toEqual({
      spreadsheetId: "abc",
      range: "Sheet1!A1",
      values: [["a", "b"]],
    });
    expect(() => validateAppendValuesInput({ spreadsheetId: "abc", range: "Sheet1", values: ["not a 2d array"] })).toThrow();
  });

  test("get values action validates without access token", () => {
    const result = getSheetValues({ spreadsheetId: "abc", range: "Sheet1!A1" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sheets.values.get");
  });

  test("append values action validates without access token", () => {
    const result = appendSheetValues({ spreadsheetId: "abc", range: "Sheet1", values: [["a"]] });
    expect(result.source).toBe("connector");
    expect(result.validated).toBeDefined();
  });

  test("get values calls Sheets API and returns data", async () => {
    const requests: Request[] = [];
    const client = createSheetsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(rowsFixture);
      },
    });

    const result = await client.getValues({ spreadsheetId: "sheet123", range: "Sheet1!A1:C3" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v4/spreadsheets/sheet123/values/Sheet1!A1%3AC3");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.spreadsheetId).toBe("sheet123");
    expect(result.values).toHaveLength(3);
  });

  test("append values calls Sheets API and returns update metadata", async () => {
    const requests: Request[] = [];
    const client = createSheetsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(appendFixture);
      },
    });

    const result = await client.appendValues({ spreadsheetId: "sheet123", range: "Sheet1!A1", values: [["New", "Row"]] });

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain(":append");
    expect(result.updatedRange).toBe("Sheet1!A4:C4");
    expect(result.updatedRows).toBe(1);
    expect(result.updatedCells).toBe(3);
  });
});
