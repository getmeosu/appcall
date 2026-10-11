// One implementation of the Posts API create call shared by posts.create
// (actions.ts) and posts.publish (depth.ts): the path, the base body, the
// default distribution, and the x-restli-id read. Headers come from
// withRestliHeaders in http.ts, which pins Linkedin-Version on /rest/ only.

import { headerValue } from "./http";

export const REST_POSTS_PATH = "/rest/posts";
export const UGC_POSTS_PATH = "/v2/ugcPosts";

type Json = Record<string, unknown>;

export function defaultDistribution(): Json {
  return { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] };
}

/** Base Posts API body in wire order: author, commentary, visibility, distribution, lifecycleState. */
export function restPostBody(fields: { author: unknown; commentary: unknown; visibility?: unknown; distribution?: unknown; lifecycleState?: unknown }): Json {
  return {
    author: fields.author,
    commentary: fields.commentary,
    visibility: fields.visibility ?? "PUBLIC",
    distribution: fields.distribution ?? defaultDistribution(),
    lifecycleState: fields.lifecycleState ?? "PUBLISHED",
  };
}

/** The created post URN from the x-restli-id response header (case-insensitive); "" when absent. */
export function restliId(headers: Record<string, string>): string {
  return headerValue(headers, "x-restli-id").trim();
}

/** Reserved characters of LinkedIn's little text format: | { } @ [ ] ( ) < > # \ * _ ~ */
const LITTLE_RESERVED = /[\\|{}@\[\]()<>#*_~]/g;

/** Backslash-escapes every little-text reserved character so the text is treated as plain text. Single pass, so a backslash is never double-escaped. */
export function escapeLittleText(text: string): string {
  return text.replace(LITTLE_RESERVED, (char) => `\\${char}`);
}

/**
 * True only for the Posts API permission refusal that warrants the legacy UGC fallback:
 * HTTP 403 whose body says code ACCESS_DENIED (serviceErrorCode 100 when present), or the
 * older shape with no code, serviceErrorCode 100 and a "Not enough permissions to access" message.
 */
export function isPostsAccessDenied(status: number, body: unknown): boolean {
  if (status !== 403 || !isRecord(body)) return false;
  const serviceErrorCode = body.serviceErrorCode;
  if (serviceErrorCode !== undefined && serviceErrorCode !== 100) return false;
  if (body.code !== undefined) return body.code === "ACCESS_DENIED";
  return serviceErrorCode === 100 && typeof body.message === "string" && body.message.startsWith("Not enough permissions to access");
}

/** Legacy UGC text-share body (Share on LinkedIn). UGC shareCommentary is plain text, so it is not little-escaped. */
export function ugcTextShareBody(author: string, text: string, visibility: string): Json {
  return {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
  };
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
