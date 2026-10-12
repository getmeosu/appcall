import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";
import { isRecord } from "../../../bun/src/declarative/template";
import { normalizeSetupHost, SETUP_HOST_POLICIES } from "../../../bun/src/declarative/setup_fields";

type Match = {
  index: number;
  start: number;
  end: number;
  match: string;
  context: string;
};

export function findTextSelections(input: unknown): unknown {
  if (!isRecord(input) || typeof input.apiToken !== "string" || input.apiToken.length === 0) {
    const pageId = isRecord(input) ? input.page_id ?? input.pageId : undefined;
    const searchText = isRecord(input) ? input.search_text ?? input.searchText : undefined;
    if (pageId == null || pageId === "" || searchText == null || searchText === "") {
      const missing = pageId == null || pageId === "" ? "page_id" : "search_text";
      throw new Error(`${missing} is required`);
    }
    return {
      connector: "confluence",
      action: "page.findText",
      source: "connector",
      validated: {
        page_id: String(pageId),
        search_text: String(searchText),
      },
    };
  }

  const pageId = input.page_id ?? input.pageId;
  const searchText = input.search_text ?? input.searchText;
  if (typeof pageId !== "string" || pageId.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "page_id is required" };
  }
  if (typeof searchText !== "string" || searchText.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "search_text is required" };
  }
  const rawSite = typeof input.site === "string" ? input.site : "";
  if (rawSite.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "site is required" };
  }
  // SEC-SETUP-1: site is <name>.atlassian.net (https:// and trailing slashes tolerated).
  let site: string;
  try {
    site = normalizeSetupHost(rawSite, "site", SETUP_HOST_POLICIES.confluence!.site!);
  } catch (error) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: error instanceof Error ? error.message : "site is invalid" };
  }

  const maxResults = clampInt(input.max_results ?? input.maxResults, 25, 1, 100);
  const contextChars = clampInt(input.context_chars ?? input.contextChars, 100, 0, 500);
  const caseInsensitive = input.case_insensitive === true || input.caseInsensitive === true;
  const basicAuth = basicAuthValue(input);

  return fetchAndSearch({
    site,
    pageId,
    searchText,
    maxResults,
    contextChars,
    caseInsensitive,
    basicAuth,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
  });
}

async function fetchAndSearch(args: {
  site: string;
  pageId: string;
  searchText: string;
  maxResults: number;
  contextChars: number;
  caseInsensitive: boolean;
  basicAuth: string;
  fetch?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const client = createConnectorHttpClient({
    allowedHosts: [args.site],
    maxResponseBytes: 1_048_576,
    timeoutMs: 15_000,
    fetch: args.fetch,
  });
  const url = new URL(`https://${args.site}/wiki/api/v2/pages/${encodeURIComponent(args.pageId)}`);
  url.searchParams.set("body-format", "storage");

  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await client.fetchText(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${args.basicAuth}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers["retry-after"] ?? 60);
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Rate limited",
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 60,
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: upstreamMessage(response.body) };
  }

  let page: unknown = null;
  try {
    page = response.body.length === 0 ? null : JSON.parse(response.body);
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }

  const haystack = pageBodyText(page);
  const matches = locateMatches(haystack, args.searchText, {
    maxResults: args.maxResults,
    contextChars: args.contextChars,
    caseInsensitive: args.caseInsensitive,
  });

  return {
    connector: "confluence",
    action: "page.findText",
    source: "provider",
    page,
    matches,
    count: matches.length,
  };
}

export function locateMatches(
  haystack: string,
  searchText: string,
  options: { maxResults: number; contextChars: number; caseInsensitive: boolean },
): Match[] {
  if (searchText.length === 0 || haystack.length === 0) {
    return [];
  }
  const source = options.caseInsensitive ? haystack.toLowerCase() : haystack;
  const needle = options.caseInsensitive ? searchText.toLowerCase() : searchText;
  const matches: Match[] = [];
  let from = 0;
  while (matches.length < options.maxResults) {
    const start = source.indexOf(needle, from);
    if (start < 0) {
      break;
    }
    const end = start + searchText.length;
    const contextStart = Math.max(0, start - options.contextChars);
    const contextEnd = Math.min(haystack.length, end + options.contextChars);
    matches.push({
      index: matches.length,
      start,
      end,
      match: haystack.slice(start, end),
      context: haystack.slice(contextStart, contextEnd),
    });
    from = start + Math.max(needle.length, 1);
  }
  return matches;
}

function pageBodyText(page: unknown): string {
  if (!isRecord(page)) {
    return "";
  }
  const body = page.body;
  if (typeof body === "string") {
    return body;
  }
  if (isRecord(body) && typeof body.value === "string") {
    return body.value;
  }
  if (isRecord(body) && isRecord(body.storage) && typeof body.storage.value === "string") {
    return body.storage.value;
  }
  return "";
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function basicAuthValue(input: Record<string, unknown>): string {
  if (typeof input.basicAuth === "string" && input.basicAuth.length > 0) {
    return input.basicAuth;
  }
  const email = typeof input.email === "string" ? input.email : "";
  const apiToken = typeof input.apiToken === "string" ? input.apiToken : "";
  return Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64");
}

function upstreamMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed)) {
      if (typeof parsed.message === "string" && parsed.message.length > 0) {
        return parsed.message;
      }
      const errors = parsed.errors;
      if (Array.isArray(errors) && isRecord(errors[0])) {
        const first = errors[0];
        if (typeof first.detail === "string" && first.detail.length > 0) {
          return first.detail;
        }
        if (typeof first.title === "string" && first.title.length > 0) {
          return first.title;
        }
      }
    }
  } catch {
    // fall through
  }
  return "Upstream request failed.";
}
