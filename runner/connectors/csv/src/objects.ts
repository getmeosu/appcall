/**
 * CSV connector — normalized types.
 *
 * The CSV connector provides import/export capabilities for tabular data.
 * Each row is normalized into a generic key-value structure.
 */

export type NormalizedRow = {
  id: string;
  provider: "csv";
  rowIndex: number;
  values: Record<string, string>;
  raw: Record<string, string>;
};

/**
 * Normalize a single CSV row into the standard row shape.
 *
 * @param rowIndex - Zero-based row index in the source CSV.
 * @param values   - Object mapping column headers to cell values (all strings).
 * @param idPrefix - Optional prefix for the generated id (default: "csv-row").
 */
export function normalizeRow(
  rowIndex: number,
  values: Record<string, string>,
  idPrefix: string = "csv-row",
): NormalizedRow {
  return {
    id: `${idPrefix}:${rowIndex}`,
    provider: "csv",
    rowIndex,
    values: { ...values },
    raw: { ...values },
  };
}

/**
 * Parse a raw CSV string (with header row) into normalized rows.
 *
 * Handles basic quoted-field CSV. Returns an empty array for malformed input.
 */
export function parseCsvRows(csv: string): NormalizedRow[] {
  if (typeof csv !== "string" || csv.trim().length === 0) return [];

  const lines = splitCsvLines(csv);
  if (lines.length < 2) return []; // need at least header + one data row

  const headers = parseCsvLine(lines[0]);
  if (headers.length === 0) return [];

  const rows: NormalizedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const values: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      values[headers[j]] = fields[j] ?? "";
    }
    rows.push(normalizeRow(i - 1, values));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Internal CSV parsing helpers
// ---------------------------------------------------------------------------

function splitCsvLines(csv: string): string[] {
  // Naive split — sufficient for well-formed CSV with standard \n or \r\n
  return csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}
