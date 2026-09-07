import { createLinkedInClient, parseLinkedInRateLimit } from "./http";
import { normalizePost } from "./posts";

export type CreatePostInput = { text: string; visibility?: string; title?: string };

export function createPost(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreatePostInput(input);
    const authorUrn = typeof input.authorUrn === "string" ? input.authorUrn : "urn:li:person:me";
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createLinkedInClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "posts.create" })
      .fetchJSON("/v2/ugcPosts", {
        method: "POST",
        body: JSON.stringify({
          author: authorUrn,
          commentary: payload.text,
          visibility: payload.visibility || "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: "PUBLISHED",
        }),
      })
      .then((result) => {
        if (result.status === 201) return { connector: "linkedin", action: "posts.create", source: "connector", post: normalizePost(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "linkedin", action: "posts.create", source: "connector", validated: validateCreatePostInput(input) };
}

function validateCreatePostInput(input: unknown): CreatePostInput {
  if (!isRecord(input)) throw new Error("create post input must be an object");
  return {
    text: requireString(input.text, "text"),
    visibility: typeof input.visibility === "string" ? input.visibility : undefined,
    title: typeof input.title === "string" ? input.title : undefined,
  };
}

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
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
