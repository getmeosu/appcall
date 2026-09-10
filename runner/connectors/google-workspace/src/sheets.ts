import { createGoogleClient } from "./http";
import type { ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type SheetRow = {
  id: string;
  rowIndex: number;
  values: unknown[];
  [key: string]: unknown;
};

export type Worksheet = {
  id: string;
  spreadsheetId: string;
  title: string;
  index: number;
  sheetType: string;
  rowCount?: number;
  columnCount?: number;
  hidden?: boolean;
  [key: string]: unknown;
};

export type GetValuesInput = {
  spreadsheetId: string;
  range: string;
};

export type GetValuesResult = {
  spreadsheetId: string;
  range: string;
  majorDimension: string;
  values: unknown[][];
};

export type AppendValuesInput = {
  spreadsheetId: string;
  range: string;
  values: unknown[][];
  valueInputOption?: string;
  insertDataOption?: string;
  majorDimension?: string;
};

export type AppendValuesResult = {
  spreadsheetId: string;
  tableRange: string;
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
};

export function parseRowsResponse(response: unknown, spreadsheetId: string, sheetName: string): { rows: SheetRow[] } {
  if (!isRecord(response)) {
    return { rows: [] };
  }
  const values = response.values;
  if (!Array.isArray(values)) {
    return { rows: [] };
  }
  return {
    rows: values.map((row: unknown, index: number) => ({
      id: `${spreadsheetId}_${sheetName || "default"}_${index + 1}`,
      rowIndex: index + 1,
      values: Array.isArray(row) ? row : [],
    })),
  };
}

export function parseWorksheetsResponse(response: unknown): { worksheets: Worksheet[] } {
  if (!isRecord(response)) {
    return { worksheets: [] };
  }
  const sheets = response.sheets;
  if (!Array.isArray(sheets)) {
    return { worksheets: [] };
  }
  const spreadsheetId = typeof response.spreadsheetId === "string" ? response.spreadsheetId : "";
  return {
    worksheets: sheets.map((sheet: unknown) => {
      if (!isRecord(sheet)) {
        return { id: "unknown", spreadsheetId, title: "", index: 0, sheetType: "GRID" };
      }
      const properties = isRecord(sheet.properties) ? sheet.properties : {};
      const gridProperties = isRecord(properties.gridProperties) ? properties.gridProperties : {};
      return {
        id: String(properties.sheetId ?? "0"),
        spreadsheetId,
        title: String(properties.title ?? ""),
        index: Number(properties.index ?? 0),
        sheetType: String(properties.sheetType ?? "GRID"),
        rowCount: typeof gridProperties.rowCount === "number" ? gridProperties.rowCount : undefined,
        columnCount: typeof gridProperties.columnCount === "number" ? gridProperties.columnCount : undefined,
        hidden: typeof properties.hidden === "boolean" ? properties.hidden : undefined,
      };
    }),
  };
}

export function validateGetValuesInput(input: unknown): GetValuesInput {
  if (!isRecord(input)) {
    throw new Error("get values input must be an object");
  }
  return {
    spreadsheetId: requireString(input.spreadsheetId, "spreadsheetId"),
    range: requireString(input.range, "range"),
  };
}

export function validateAppendValuesInput(input: unknown): AppendValuesInput {
  if (!isRecord(input)) {
    throw new Error("append values input must be an object");
  }
  const spreadsheetId = requireString(input.spreadsheetId, "spreadsheetId");
  const range = requireString(input.range, "range");
  const values = requireArray(input.values, "values");

  if (!values.every((row) => Array.isArray(row))) {
    throw new Error("values must be a 2D array");
  }

  return {
    spreadsheetId,
    range,
    values,
    valueInputOption: typeof input.valueInputOption === "string" ? input.valueInputOption : undefined,
    insertDataOption: typeof input.insertDataOption === "string" ? input.insertDataOption : undefined,
    majorDimension: typeof input.majorDimension === "string" ? input.majorDimension : undefined,
  };
}

export function createSheetsClient(options: { accessToken: string; fetch?: typeof fetch; httpClient?: ConnectorHttpClient }): SheetsClient {
  const createHttpClient = (operation: string): ConnectorHttpClient => createGoogleClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    httpClient: options.httpClient,
    operation,
  });
  const authHeaders = { Authorization: `Bearer ${options.accessToken}` };
  const jsonHeaders = { ...authHeaders, "Content-Type": "application/json" };

  return {
    async getValues(input: unknown): Promise<GetValuesResult> {
      const payload = validateGetValuesInput(input);
      const response = await createHttpClient("sheets.values.get").fetchText(
        `https://www.googleapis.com/v4/spreadsheets/${encodeURIComponent(payload.spreadsheetId)}/values/${encodeURIComponent(payload.range)}`,
        {
          headers: { Authorization: `Bearer ${options.accessToken}` },
        },
      );
      const body = readJsonObject(response.body);
      if (response.status >= 400) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Sheets API rejected the request", providerError: String(body) };
      }
      return {
        spreadsheetId: String(body.spreadsheetId ?? payload.spreadsheetId),
        range: String(body.range ?? payload.range),
        majorDimension: String(body.majorDimension ?? "ROWS"),
        values: Array.isArray(body.values) ? body.values : [],
      };
    },

    async appendValues(input: unknown): Promise<AppendValuesResult> {
      const payload = validateAppendValuesInput(input);
      const params = new URLSearchParams();
      params.set("valueInputOption", payload.valueInputOption ?? "USER_ENTERED");
      params.set("insertDataOption", payload.insertDataOption ?? "INSERT_ROWS");
      params.set("includeValuesInResponse", "true");

      const response = await createHttpClient("sheets.values.append").fetchText(
        `https://www.googleapis.com/v4/spreadsheets/${encodeURIComponent(payload.spreadsheetId)}/values/${encodeURIComponent(payload.range)}:append?${params}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${options.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: payload.values, majorDimension: payload.majorDimension ?? "ROWS" }),
        },
      );
      const body = readJsonObject(response.body);
      if (response.status >= 400) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Sheets API rejected the append request", providerError: String(body) };
      }
      const updates = isRecord(body.updates) ? body.updates : {};
      return {
        spreadsheetId: String(body.spreadsheetId ?? payload.spreadsheetId),
        tableRange: String(body.tableRange ?? ""),
        updatedRange: String(updates.updatedRange ?? ""),
        updatedRows: Number(updates.updatedRows ?? 0),
        updatedColumns: Number(updates.updatedColumns ?? 0),
        updatedCells: Number(updates.updatedCells ?? 0),
      };
    },

    async updateValues(input: unknown): Promise<UpdateValuesResult> {
      const payload = validateUpdateValuesInput(input);
      const params = new URLSearchParams();
      params.set("valueInputOption", payload.valueInputOption ?? "USER_ENTERED");

      const response = await createHttpClient("sheets.values.update").fetchText(
        `https://www.googleapis.com/v4/spreadsheets/${encodeURIComponent(payload.spreadsheetId)}/values/${encodeURIComponent(payload.range)}?${params}`,
        {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify({ values: payload.values, majorDimension: "ROWS" }),
        },
      );
      const body = readJsonObject(response.body);
      if (response.status >= 400) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Sheets API rejected the update request", providerError: String(body) };
      }
      return {
        spreadsheetId: String(body.spreadsheetId ?? payload.spreadsheetId),
        updatedRange: String(body.updatedRange ?? payload.range),
        updatedRows: Number(body.updatedRows ?? 0),
        updatedColumns: Number(body.updatedColumns ?? 0),
        updatedCells: Number(body.updatedCells ?? 0),
      };
    },

    async clearValues(input: unknown): Promise<ClearValuesResult> {
      const payload = validateClearValuesInput(input);
      const response = await createHttpClient("sheets.values.clear").fetchText(
        `https://www.googleapis.com/v4/spreadsheets/${encodeURIComponent(payload.spreadsheetId)}/values/${encodeURIComponent(payload.range)}:clear`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: "{}",
        },
      );
      const body = readJsonObject(response.body);
      if (response.status >= 400) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Sheets API rejected the clear request", providerError: String(body) };
      }
      return {
        spreadsheetId: String(body.spreadsheetId ?? payload.spreadsheetId),
        clearedRange: String(body.clearedRange ?? payload.range),
      };
    },

    async createSpreadsheet(input: unknown): Promise<CreateSpreadsheetResult> {
      const payload = validateCreateSpreadsheetInput(input);
      const body: Record<string, unknown> = {
        properties: { title: payload.title },
      };
      if (payload.sheetTitles && payload.sheetTitles.length > 0) {
        body.sheets = payload.sheetTitles.map((title) => ({ properties: { title } }));
      }
      const response = await createHttpClient("sheets.spreadsheets.create").fetchText(
        "https://www.googleapis.com/v4/spreadsheets",
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(body),
        },
      );
      const respBody = readJsonObject(response.body);
      if (response.status >= 400) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Sheets API rejected the create spreadsheet request", providerError: String(respBody) };
      }
      const properties = isRecord(respBody.properties) ? respBody.properties : {};
      return {
        spreadsheetId: String(respBody.spreadsheetId ?? ""),
        spreadsheetUrl: String(respBody.spreadsheetUrl ?? ""),
        title: String(properties.title ?? payload.title),
      };
    },

    async batchUpdateSpreadsheet(input: unknown): Promise<BatchUpdateSpreadsheetResult> {
      const payload = validateBatchUpdateSpreadsheetInput(input);
      const googleRequests = payload.requests.map(toGoogleBatchUpdateRequest);
      const response = await createHttpClient("sheets.spreadsheets.batchUpdate").fetchText(
        `https://www.googleapis.com/v4/spreadsheets/${encodeURIComponent(payload.spreadsheetId)}:batchUpdate`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ requests: googleRequests }),
        },
      );
      const respBody = readJsonObject(response.body);
      if (response.status >= 400) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Sheets API rejected the batch update request", providerError: String(respBody) };
      }
      return {
        spreadsheetId: String(respBody.spreadsheetId ?? payload.spreadsheetId),
        replies: Array.isArray(respBody.replies) ? respBody.replies : [],
      };
    },
  };
}

export type UpdateValuesInput = {
  spreadsheetId: string;
  range: string;
  values: unknown[][];
  valueInputOption?: string;
};

export type UpdateValuesResult = {
  spreadsheetId: string;
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
};

export type ClearValuesInput = {
  spreadsheetId: string;
  range: string;
};

export type ClearValuesResult = {
  spreadsheetId: string;
  clearedRange: string;
};

export type CreateSpreadsheetInput = {
  title: string;
  sheetTitles?: string[];
};

export type CreateSpreadsheetResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
};

export type BatchUpdateSpreadsheetInput = {
  spreadsheetId: string;
  requests: SafeBatchUpdateRequest[];
};

export type BatchUpdateSpreadsheetResult = {
  spreadsheetId: string;
  replies: unknown[];
};

type SafeBatchUpdateRequest =
  | { freezeRows: { sheetId: number; rowCount: number } }
  | { setBasicFilter: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } }
  | { autoResizeColumns: { sheetId: number; startIndex: number; endIndex: number } }
  | { setColumnWidth: { sheetId: number; startIndex: number; endIndex: number; pixelSize: number } }
  | { repeatCell: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number; cell: Record<string, unknown>; fields: string } };

export function validateUpdateValuesInput(input: unknown): UpdateValuesInput {
  if (!isRecord(input)) throw new Error("update values input must be an object");
  const spreadsheetId = requireString(input.spreadsheetId, "spreadsheetId");
  const range = requireString(input.range, "range");
  const values = requireArray(input.values, "values");
  if (!values.every((row) => Array.isArray(row))) throw new Error("values must be a 2D array");
  return {
    spreadsheetId,
    range,
    values,
    valueInputOption: typeof input.valueInputOption === "string" ? input.valueInputOption : undefined,
  };
}

export function validateClearValuesInput(input: unknown): ClearValuesInput {
  if (!isRecord(input)) throw new Error("clear values input must be an object");
  return {
    spreadsheetId: requireString(input.spreadsheetId, "spreadsheetId"),
    range: requireString(input.range, "range"),
  };
}

export function validateCreateSpreadsheetInput(input: unknown): CreateSpreadsheetInput {
  if (!isRecord(input)) throw new Error("create spreadsheet input must be an object");
  return {
    title: requireString(input.title, "title"),
    sheetTitles: Array.isArray(input.sheetTitles)
      ? input.sheetTitles.filter((t): t is string => typeof t === "string")
      : undefined,
  };
}

export function validateBatchUpdateSpreadsheetInput(input: unknown): BatchUpdateSpreadsheetInput {
  if (!isRecord(input)) throw new Error("batch update spreadsheet input must be an object");
  const spreadsheetId = requireString(input.spreadsheetId, "spreadsheetId");
  const requests = requireArray(input.requests, "requests");
  if (requests.length === 0) throw new Error("requests must not be empty");
  if (requests.length > 50) throw new Error("requests must contain at most 50 items");
  return {
    spreadsheetId,
    requests: requests.map(validateSafeBatchUpdateRequest),
  };
}

export type SheetsClient = {
  getValues(input: unknown): Promise<GetValuesResult>;
  appendValues(input: unknown): Promise<AppendValuesResult>;
  updateValues(input: unknown): Promise<UpdateValuesResult>;
  clearValues(input: unknown): Promise<ClearValuesResult>;
  createSpreadsheet(input: unknown): Promise<CreateSpreadsheetResult>;
  batchUpdateSpreadsheet(input: unknown): Promise<BatchUpdateSpreadsheetResult>;
};

function validateSafeBatchUpdateRequest(value: unknown): SafeBatchUpdateRequest {
  if (!isRecord(value)) throw new Error("batch update request must be an object");
  const keys = Object.keys(value);
  if (keys.length !== 1) throw new Error("batch update request must contain exactly one supported operation");
  if (isRecord(value.freezeRows)) {
    return {
      freezeRows: {
        sheetId: requireNumber(value.freezeRows.sheetId, "freezeRows.sheetId"),
        rowCount: requireBoundedInt(value.freezeRows.rowCount, "freezeRows.rowCount", 0, 100),
      },
    };
  }
  if (isRecord(value.setBasicFilter)) {
    return {
      setBasicFilter: {
        sheetId: requireNumber(value.setBasicFilter.sheetId, "setBasicFilter.sheetId"),
        startRowIndex: optionalBoundedInt(value.setBasicFilter.startRowIndex, "setBasicFilter.startRowIndex", 0, 100000),
        endRowIndex: optionalBoundedInt(value.setBasicFilter.endRowIndex, "setBasicFilter.endRowIndex", 0, 100000),
        startColumnIndex: optionalBoundedInt(value.setBasicFilter.startColumnIndex, "setBasicFilter.startColumnIndex", 0, 1000),
        endColumnIndex: optionalBoundedInt(value.setBasicFilter.endColumnIndex, "setBasicFilter.endColumnIndex", 0, 1000),
      },
    };
  }
  if (isRecord(value.autoResizeColumns)) {
    return {
      autoResizeColumns: {
        sheetId: requireNumber(value.autoResizeColumns.sheetId, "autoResizeColumns.sheetId"),
        startIndex: requireBoundedInt(value.autoResizeColumns.startIndex, "autoResizeColumns.startIndex", 0, 1000),
        endIndex: requireBoundedInt(value.autoResizeColumns.endIndex, "autoResizeColumns.endIndex", 1, 1000),
      },
    };
  }
  if (isRecord(value.setColumnWidth)) {
    return {
      setColumnWidth: {
        sheetId: requireNumber(value.setColumnWidth.sheetId, "setColumnWidth.sheetId"),
        startIndex: requireBoundedInt(value.setColumnWidth.startIndex, "setColumnWidth.startIndex", 0, 1000),
        endIndex: requireBoundedInt(value.setColumnWidth.endIndex, "setColumnWidth.endIndex", 1, 1000),
        pixelSize: requireBoundedInt(value.setColumnWidth.pixelSize, "setColumnWidth.pixelSize", 20, 1000),
      },
    };
  }
  if (isRecord(value.repeatCell)) {
    const fields = requireString(value.repeatCell.fields, "repeatCell.fields");
    if (fields.includes("*")) throw new Error("repeatCell.fields must not use wildcard");
    const cell = value.repeatCell.cell;
    if (!isRecord(cell)) throw new Error("repeatCell.cell must be an object");
    return {
      repeatCell: {
        sheetId: requireNumber(value.repeatCell.sheetId, "repeatCell.sheetId"),
        startRowIndex: optionalBoundedInt(value.repeatCell.startRowIndex, "repeatCell.startRowIndex", 0, 100000),
        endRowIndex: optionalBoundedInt(value.repeatCell.endRowIndex, "repeatCell.endRowIndex", 0, 100000),
        startColumnIndex: optionalBoundedInt(value.repeatCell.startColumnIndex, "repeatCell.startColumnIndex", 0, 1000),
        endColumnIndex: optionalBoundedInt(value.repeatCell.endColumnIndex, "repeatCell.endColumnIndex", 0, 1000),
        cell,
        fields,
      },
    };
  }
  throw new Error(`unsupported batch update operation: ${keys[0] ?? "unknown"}`);
}

function toGoogleBatchUpdateRequest(request: SafeBatchUpdateRequest): Record<string, unknown> {
  if ("freezeRows" in request) {
    return {
      updateSheetProperties: {
        properties: { sheetId: request.freezeRows.sheetId, gridProperties: { frozenRowCount: request.freezeRows.rowCount } },
        fields: "gridProperties.frozenRowCount",
      },
    };
  }
  if ("setBasicFilter" in request) {
    return {
      setBasicFilter: {
        filter: { range: gridRange(request.setBasicFilter) },
      },
    };
  }
  if ("autoResizeColumns" in request) {
    return {
      autoResizeDimensions: {
        dimensions: { sheetId: request.autoResizeColumns.sheetId, dimension: "COLUMNS", startIndex: request.autoResizeColumns.startIndex, endIndex: request.autoResizeColumns.endIndex },
      },
    };
  }
  if ("setColumnWidth" in request) {
    return {
      updateDimensionProperties: {
        range: { sheetId: request.setColumnWidth.sheetId, dimension: "COLUMNS", startIndex: request.setColumnWidth.startIndex, endIndex: request.setColumnWidth.endIndex },
        properties: { pixelSize: request.setColumnWidth.pixelSize },
        fields: "pixelSize",
      },
    };
  }
  return {
    repeatCell: {
      range: gridRange(request.repeatCell),
      cell: request.repeatCell.cell,
      fields: request.repeatCell.fields,
    },
  };
}

function gridRange(input: { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number }): Record<string, number> {
  const range: Record<string, number> = { sheetId: input.sheetId };
  if (input.startRowIndex !== undefined) range.startRowIndex = input.startRowIndex;
  if (input.endRowIndex !== undefined) range.endRowIndex = input.endRowIndex;
  if (input.startColumnIndex !== undefined) range.startColumnIndex = input.startColumnIndex;
  if (input.endColumnIndex !== undefined) range.endColumnIndex = input.endColumnIndex;
  return range;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

function requireBoundedInt(value: unknown, field: string, min: number, max: number): number {
  const n = requireNumber(value, field);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function optionalBoundedInt(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  return requireBoundedInt(value, field, min, max);
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value;
}

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(bodyText);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
