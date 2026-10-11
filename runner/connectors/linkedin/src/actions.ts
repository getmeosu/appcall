import { createLinkedInClient, parseLinkedInRateLimit, type LinkedInClient } from "./http";
import { normalizePost } from "./posts";
import { LINKEDIN_USERINFO_PATH } from "./profile";
import { REST_POSTS_PATH, UGC_POSTS_PATH, escapeLittleText, isPostsAccessDenied, restPostBody, restliId, ugcTextShareBody } from "./rest-posts";

export type CreatePostInput = { text: string; visibility?: string; title?: string };

type HttpResult = { status: number; headers: Record<string, string>; body: unknown };

const VISIBILITIES = ["PUBLIC", "CONNECTIONS"];
const MEMBER_URN = /^urn:li:person:[^\s:]+$/;

/**
 * posts.create: a text-only post as the authenticated member via POST /rest/posts.
 * Member posts only. The author is the explicit urn:li:person authorUrn, or
 * urn:li:person:{sub} from GET /v2/userinfo; urn:li:person:me is never sent.
 * Falls back to the legacy /v2/ugcPosts text share only on a 403 ACCESS_DENIED.
 */
export function createPost(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const payload = validateCreatePostInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const explicitAuthor = memberAuthor(input.authorUrn);
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const client = createLinkedInClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "posts.create" });
    return createPostCall(client, payload, explicitAuthor);
  }
  return { connector: "linkedin", action: "posts.create", source: "connector", validated: payload };
}

async function createPostCall(client: LinkedInClient, payload: CreatePostInput, explicitAuthor: string): Promise<Record<string, unknown>> {
  const author = explicitAuthor || await resolveMemberAuthor(client);
  const visibility = payload.visibility || "PUBLIC";
  const body = { ...restPostBody({ author, commentary: escapeLittleText(payload.text), visibility }), isReshareDisabledByAuthor: false };
  const result = await client.fetchJSON(REST_POSTS_PATH, { method: "POST", body: JSON.stringify(body) });
  if (result.status === 201) return created(result, body, payload.text, visibility);
  if (!isPostsAccessDenied(result.status, result.body)) throw handleError(result);
  const ugcBody = ugcTextShareBody(author, payload.text, visibility);
  const fallback = await client.fetchJSON(UGC_POSTS_PATH, { method: "POST", body: JSON.stringify(ugcBody) });
  if (fallback.status === 201) return created(fallback, ugcBody, payload.text, visibility);
  throw handleError(fallback);
}

async function resolveMemberAuthor(client: LinkedInClient): Promise<string> {
  const result = await client.fetchJSON(LINKEDIN_USERINFO_PATH, { method: "GET" });
  if (result.status !== 200) throw handleError(result);
  const sub = isRecord(result.body) && typeof result.body.sub === "string" ? result.body.sub.trim() : "";
  if (!sub) throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "LinkedIn userinfo did not include a member id (sub)." };
  return `urn:li:person:${sub}`;
}

function created(result: HttpResult, sent: Record<string, unknown>, text: string, visibility: string): Record<string, unknown> {
  const urn = restliId(result.headers);
  if (!urn) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "LinkedIn accepted the post (201) but returned no x-restli-id header, so the post id is unknown. Check the feed before retrying.",
    };
  }
  const extra = isRecord(result.body) ? result.body : {};
  const providerPostId = urn.replace(/^urn:li:(share|ugcPost|post):/, "");
  const post = normalizePost({ ...sent, ...extra, id: urn });
  return {
    connector: "linkedin",
    action: "posts.create",
    source: "connector",
    post: { ...post, id: `li-post:${providerPostId}`, providerPostId, text, visibility, postType: "PUBLISHED" },
  };
}

function validateCreatePostInput(input: unknown): CreatePostInput {
  if (!isRecord(input)) throw new Error("create post input must be an object");
  const visibility = typeof input.visibility === "string" ? input.visibility : undefined;
  if (visibility !== undefined && visibility !== "" && !VISIBILITIES.includes(visibility)) {
    throw new Error(`visibility must be one of: ${VISIBILITIES.join(", ")}`);
  }
  if (input.authorUrn !== undefined && input.authorUrn !== null && input.authorUrn !== "") memberAuthor(input.authorUrn);
  return {
    text: requireString(input.text, "text"),
    visibility,
    title: typeof input.title === "string" ? input.title : undefined,
  };
}

/** The explicit member author, or "" when absent. Organization and malformed URNs are refused before any request. */
function memberAuthor(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error("authorUrn must be a string");
  const urn = value.trim();
  if (urn.startsWith("urn:li:organization:")) {
    throw new Error("posts.create posts as the member only; organization authors are not supported");
  }
  if (urn === "urn:li:person:me" || !MEMBER_URN.test(urn)) {
    throw new Error("authorUrn must be a urn:li:person:{id} member URN");
  }
  return urn;
}

function handleError(result: HttpResult) {
  const rateLimit = parseLinkedInRateLimit(result.status, result.headers);
  if (rateLimit.limited) {
    return { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "LinkedIn rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds };
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "LinkedIn rejected the request." };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
