import { describe, expect, test } from "bun:test";
import sheetsUpdateFixture from "../fixtures/sheets_update.json";
import sheetsClearFixture from "../fixtures/sheets_clear.json";
import spreadsheetCreateFixture from "../fixtures/spreadsheet_create.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import {
  createSheetsClient,
  validateUpdateValuesInput,
  validateClearValuesInput,
  validateCreateSpreadsheetInput,
  validateBatchUpdateSpreadsheetInput,
} from "../src/sheets";

const sheetsOperations: Array<(client: ReturnType<typeof createSheetsClient>) => Promise<unknown>> = [
  (client) => client.getValues({ spreadsheetId: "spreadsheet-id", range: "Sheet1!A1" }),
  (client) => client.appendValues({ spreadsheetId: "spreadsheet-id", range: "Sheet1!A1", values: [["value"]] }),
  (client) => client.updateValues({ spreadsheetId: "spreadsheet-id", range: "Sheet1!A1", values: [["value"]] }),
  (client) => client.clearValues({ spreadsheetId: "spreadsheet-id", range: "Sheet1!A1" }),
  (client) => client.createSpreadsheet({ title: "Test" }),
  (client) => client.batchUpdateSpreadsheet({
    spreadsheetId: "spreadsheet-id",
    requests: [{ freezeRows: { sheetId: 0, rowCount: 1 } }],
  }),
];

describe("google-workspace Sheets extended actions", () => {
  // ─── sheets.values.update ───────────────────────────────────────────────

  test("validateUpdateValuesInput accepts valid input", () => {
    const r = validateUpdateValuesInput({
      spreadsheetId: "spreadId",
      range: "Sheet1!A1:B2",
      values: [["a", "b"], ["c", "d"]],
    });
    expect(r.spreadsheetId).toBe("spreadId");
    expect(r.range).toBe("Sheet1!A1:B2");
    expect(r.values).toHaveLength(2);
  });

  test("validateUpdateValuesInput throws if values is not 2D array", () => {
    expect(() =>
      validateUpdateValuesInput({ spreadsheetId: "s", range: "A1", values: ["a", "b"] })
    ).toThrow();
  });

  test("validateUpdateValuesInput throws on missing required fields", () => {
    expect(() => validateUpdateValuesInput({ spreadsheetId: "s", range: "A1" })).toThrow();
    expect(() => validateUpdateValuesInput("not-object")).toThrow();
  });

  test("updateValues sends PUT to correct URL with auth", async () => {
    const requests: Request[] = [];
    const client = createSheetsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(sheetsUpdateFixture);
      },
    });

    const result = await client.updateValues({
      spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      range: "Sheet1!A1:C2",
      values: [["a", "b", "c"], ["d", "e", "f"]],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://sheets.googleapis.com/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/values/Sheet1!A1%3AC2?valueInputOption=USER_ENTERED");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(await requests[0].json()).toEqual({ values: [["a", "b", "c"], ["d", "e", "f"]], majorDimension: "ROWS" });
    expect(result.spreadsheetId).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
    expect(result.updatedRange).toBe("Sheet1!A1:C2");
    expect(result.updatedRows).toBe(2);
    expect(result.updatedCells).toBe(6);
  });

  test("updateValues throws on upstream error", async () => {
    const client = createSheetsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 400, message: "Bad Request" } }),
        { status: 400 },
      ),
    });

    await expect(
      client.updateValues({ spreadsheetId: "s", range: "A1", values: [["a"]] })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  // ─── sheets.values.clear ────────────────────────────────────────────────

  test("validateClearValuesInput accepts valid input", () => {
    const r = validateClearValuesInput({ spreadsheetId: "sId", range: "Sheet1!A1:C10" });
    expect(r.spreadsheetId).toBe("sId");
    expect(r.range).toBe("Sheet1!A1:C10");
  });

  test("validateClearValuesInput throws on missing fields", () => {
    expect(() => validateClearValuesInput({ spreadsheetId: "s" })).toThrow();
    expect(() => validateClearValuesInput("not-object")).toThrow();
  });

  test("clearValues sends POST to :clear URL", async () => {
    const requests: Request[] = [];
    const client = createSheetsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(sheetsClearFixture);
      },
    });

    const result = await client.clearValues({
      spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      range: "Sheet1!A1:C10",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://sheets.googleapis.com/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/values/Sheet1!A1%3AC10:clear");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(await requests[0].json()).toEqual({});
    expect(result.spreadsheetId).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
    expect(result.clearedRange).toBe("Sheet1!A1:C10");
  });

  test("clearValues throws on upstream error", async () => {
    const client = createSheetsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 403, message: "Forbidden" } }),
        { status: 403 },
      ),
    });

    await expect(
      client.clearValues({ spreadsheetId: "s", range: "A1" })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  // ─── sheets.spreadsheets.create ─────────────────────────────────────────

  test("validateCreateSpreadsheetInput accepts valid input", () => {
    const r = validateCreateSpreadsheetInput({ title: "My Spreadsheet" });
    expect(r.title).toBe("My Spreadsheet");
  });

  test("validateCreateSpreadsheetInput accepts optional sheetTitles", () => {
    const r = validateCreateSpreadsheetInput({
      title: "Budget",
      sheetTitles: ["Q1", "Q2", "Q3"],
    });
    expect(r.sheetTitles).toEqual(["Q1", "Q2", "Q3"]);
  });

  test("validateCreateSpreadsheetInput throws on missing title", () => {
    expect(() => validateCreateSpreadsheetInput({})).toThrow();
    expect(() => validateCreateSpreadsheetInput("not-object")).toThrow();
  });

  test("createSpreadsheet posts to Sheets API and returns spreadsheet metadata", async () => {
    const requests: Request[] = [];
    const client = createSheetsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(spreadsheetCreateFixture);
      },
    });

    const result = await client.createSpreadsheet({ title: "My New Spreadsheet" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://sheets.googleapis.com/v4/spreadsheets");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(await requests[0].json()).toEqual({ properties: { title: "My New Spreadsheet" } });
    expect(result.spreadsheetId).toBe("newSpreadsheetId123");
    expect(result.spreadsheetUrl).toContain("newSpreadsheetId123");
    expect(result.title).toBe("My New Spreadsheet");
  });

  test("createSpreadsheet throws on upstream error", async () => {
    const client = createSheetsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 401, message: "Unauthorized" } }),
        { status: 401 },
      ),
    });

    await expect(
      client.createSpreadsheet({ title: "Test" })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  // ─── sheets.spreadsheets.batchUpdate ───────────────────────────────────

  test("validateBatchUpdateSpreadsheetInput accepts safe formatting requests", () => {
    const r = validateBatchUpdateSpreadsheetInput({
      spreadsheetId: "spreadId",
      requests: [
        { freezeRows: { sheetId: 0, rowCount: 1 } },
        { setBasicFilter: { sheetId: 0, startRowIndex: 0, endColumnIndex: 10 } },
        { autoResizeColumns: { sheetId: 0, startIndex: 0, endIndex: 10 } },
        {
          repeatCell: {
            sheetId: 0,
            startRowIndex: 0,
            endRowIndex: 1,
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
      ],
    });
    expect(r.spreadsheetId).toBe("spreadId");
    expect(r.requests).toHaveLength(4);
  });

  test("validateBatchUpdateSpreadsheetInput rejects unsafe or oversized requests", () => {
    expect(() => validateBatchUpdateSpreadsheetInput({ spreadsheetId: "s", requests: [] })).toThrow();
    expect(() => validateBatchUpdateSpreadsheetInput({ spreadsheetId: "s", requests: Array.from({ length: 51 }, () => ({ freezeRows: { sheetId: 0, rowCount: 1 } })) })).toThrow();
    expect(() => validateBatchUpdateSpreadsheetInput({ spreadsheetId: "s", requests: [{ deleteSheet: { sheetId: 0 } }] })).toThrow();
    expect(() => validateBatchUpdateSpreadsheetInput({ spreadsheetId: "s", requests: [{ repeatCell: { sheetId: 0, cell: {}, fields: "*" } }] })).toThrow();
  });

  test("batchUpdateSpreadsheet maps safe helpers to Google batchUpdate requests", async () => {
    const requests: Request[] = [];
    const client = createSheetsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ spreadsheetId: "spreadId", replies: [{}, {}] });
      },
    });

    const result = await client.batchUpdateSpreadsheet({
      spreadsheetId: "spreadId",
      requests: [
        { freezeRows: { sheetId: 0, rowCount: 1 } },
        { setColumnWidth: { sheetId: 0, startIndex: 0, endIndex: 3, pixelSize: 160 } },
      ],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://sheets.googleapis.com/v4/spreadsheets/spreadId:batchUpdate");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    const body = await requests[0].json() as { requests: Array<Record<string, unknown>> };
    expect(body.requests[0]).toEqual({
      updateSheetProperties: {
        properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    });
    expect(body.requests[1]).toEqual({
      updateDimensionProperties: {
        range: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 3 },
        properties: { pixelSize: 160 },
        fields: "pixelSize",
      },
    });
    expect(result.spreadsheetId).toBe("spreadId");
    expect(result.replies).toHaveLength(2);
  });

  test("selects response budgets for each Sheets operation independently", async () => {
    const responseLargerThanWriteBudget = JSON.stringify({
      spreadsheetId: "spreadId",
      range: "Sheet1!A1",
      majorDimension: "ROWS",
      values: [["value"]],
    }) + " ".repeat(1_048_576);
    const client = createSheetsClient({
      accessToken: "ya29.test-token",
      fetch: async () => new Response(responseLargerThanWriteBudget),
    });

    await expect(client.getValues({ spreadsheetId: "spreadId", range: "Sheet1!A1" })).resolves.toMatchObject({
      spreadsheetId: "spreadId",
    });
    await expect(client.appendValues({ spreadsheetId: "spreadId", range: "Sheet1!A1", values: [["value"]] })).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    });
    await expect(client.updateValues({ spreadsheetId: "spreadId", range: "Sheet1!A1", values: [["value"]] })).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    });
    await expect(client.clearValues({ spreadsheetId: "spreadId", range: "Sheet1!A1" })).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    });
    await expect(client.createSpreadsheet({ title: "Spreadsheet" })).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    });
    await expect(client.batchUpdateSpreadsheet({
      spreadsheetId: "spreadId",
      requests: [{ freezeRows: { sheetId: 0, rowCount: 1 } }],
    })).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    });
  });

  test("batchUpdateSpreadsheet throws on upstream error", async () => {
    const client = createSheetsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 400, message: "Bad Request" } }),
        { status: 400 },
      ),
    });

    await expect(
      client.batchUpdateSpreadsheet({ spreadsheetId: "s", requests: [{ freezeRows: { sheetId: 0, rowCount: 1 } }] })
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("all Sheets operations preserve rate-limit codes and valid Retry-After", async () => {
    for (const operation of sheetsOperations) {
      const client = createSheetsClient({
        accessToken: "token",
        fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
          status: 429,
          headers: { "Retry-After": "37" },
        }),
      });

      await expect(operation(client)).rejects.toMatchObject({
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        retryAfterSeconds: 37,
      });
    }
  });

  test("all Sheets operations use a safe fallback for malformed Retry-After", async () => {
    for (const retryAfter of ["not-a-number", "0", "-5", "999999999"]) {
      for (const operation of sheetsOperations) {
        const client = createSheetsClient({
          accessToken: "token",
          fetch: async () => new Response(JSON.stringify({
            error: { code: 429, message: "Rate Limit Exceeded" },
          }), {
            status: 429,
            headers: { "Retry-After": retryAfter },
          }),
        });

        const error = await operation(client).catch((value: unknown) => value as Record<string, unknown>);
        expect(error).toMatchObject({
          ok: false,
          code: "CONNECTOR_RATE_LIMITED",
          retryAfterSeconds: 10,
        });
      }
    }
  });

  test("all Sheets operations keep 400 and 401 as non-retryable upstream errors", async () => {
    for (const status of [400, 401]) {
      for (const operation of sheetsOperations) {
        const client = createSheetsClient({
          accessToken: "token",
          fetch: async () => new Response(JSON.stringify({
            error: { code: status, status, message: status === 400 ? "Bad Request" : "Unauthorized" },
          }), { status }),
        });

        const error = await operation(client).catch((value: unknown) => value as Record<string, unknown>);
        expect(error).toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
        expect(error).not.toHaveProperty("retryAfterSeconds");
      }
    }
  });
});
