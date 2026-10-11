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

/** Extract `pageId` from the rel="next" entry of an RFC 5988 Link header; null when absent. */
export function nextPageIdFromLink(header: string | null | undefined): string | null {
  if (typeof header !== "string" || header.length === 0) return null;
  const entries = header.match(/<[^>]*>[^,<]*/g) ?? [];
  for (const entry of entries) {
    const url = /^<([^>]*)>/.exec(entry)?.[1];
    if (!url) continue;
    const rel = /;\s*rel\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(entry);
    const rels = (rel?.[1] ?? rel?.[2] ?? "").toLowerCase().split(/\s+/);
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
