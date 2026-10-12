/**
 * SmartRecruiters cursor paging helpers.
 *
 * Endpoints that page by cursor return the next cursor either in the body as
 * `nextPageId` (e.g. GET /candidates, GET /jobs, GET /user-api/v201804/users,
 * GET /configuration/job-properties/{id}/values) or only in an RFC 5988 `Link`
 * response header whose rel="next" URL carries a `pageId` query parameter
 * (e.g. GET /messages). Endpoints that page by offset/limit only, or not at all,
 * do not use these helpers.
 */

const MAX_PAGE_ID_LENGTH = 2048;

/**
 * Validate an optional `pageId` input. Returns undefined when absent. The value
 * is opaque upstream, so it is only checked to be a bounded run of printable,
 * non-whitespace ASCII before it is URL-encoded into the query string.
 */
export function pageIdParam(
  value: unknown,
  field = "pageId",
  options: { emptyAsAbsent?: boolean } = {},
): string | undefined {
  if (value == null) return undefined;
  // The older sync ops dropped an empty pageId from the query; keep that behaviour.
  if (options.emptyAsAbsent && value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (value.length === 0) throw new Error(`${field} must be a non-empty string`);
  if (value.length > MAX_PAGE_ID_LENGTH) throw new Error(`${field} must be at most ${MAX_PAGE_ID_LENGTH} characters`);
  if (!/^[\x21-\x7E]+$/.test(value)) throw new Error(`${field} may only contain printable non-space ASCII characters`);
  return value;
}

/**
 * Split `text` on `sep`, ignoring separators inside `<...>` URI references and
 * quoted-string parameter values (RFC 8288 section 3; backslash escapes honoured).
 */
function splitOutsideQuotes(text: string, sep: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inUri = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) current += text[++i];
      else if (ch === '"') inQuotes = false;
      continue;
    }
    if (inUri) {
      current += ch;
      if (ch === ">") inUri = false;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === "<") inUri = true;
    else if (ch === sep) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\(.)/g, "$1");
  return v;
}

/**
 * Extract `pageId` from the rel="next" entry of an RFC 5988/8288 Link header;
 * null when absent. Link-values are split on commas outside URI references and
 * quoted strings, so a parameter such as title="a, b" does not split an entry.
 */
export function nextPageIdFromLink(header: string | null | undefined): string | null {
  if (typeof header !== "string" || header.length === 0) return null;
  for (const entry of splitOutsideQuotes(header, ",")) {
    const [target, ...params] = splitOutsideQuotes(entry, ";");
    const url = /^\s*<([^>]*)>\s*$/.exec(target ?? "")?.[1];
    if (url == null || url.length === 0) continue;
    let rels: string[] = [];
    for (const param of params) {
      const eq = param.indexOf("=");
      if (eq < 0) continue;
      if (param.slice(0, eq).trim().toLowerCase() !== "rel") continue;
      rels = unquote(param.slice(eq + 1)).toLowerCase().split(/\s+/).filter(Boolean);
      break; // RFC 8288: only the first rel parameter counts.
    }
    if (!rels.includes("next")) continue;
    try {
      const pageId = new URL(url, "https://api.smartrecruiters.com").searchParams.get("pageId");
      return pageId && pageId.length > 0 ? pageId : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Body `nextPageId` (non-empty string) first, then the Link header rel="next" pageId. */
export function nextPageIdOf(body: unknown, linkHeader?: string | null): string | null {
  if (body != null && typeof body === "object" && !Array.isArray(body)) {
    const v = (body as Record<string, unknown>).nextPageId;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return nextPageIdFromLink(linkHeader);
}
