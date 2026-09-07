export type NormalizedPost = {
  id: string;
  provider: "linkedin";
  providerPostId: string;
  authorId: string;
  text: string;
  postType: string;
  visibility: string;
  createdAt: number;
  likeCount: number;
  commentCount: number;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizePost(data: Record<string, unknown>): NormalizedPost {
  const id = extractString(data, "id") || extractString(data, "urn") || "";
  const simpleId = id.replace(/^urn:li:ugcPost:/, "").replace(/^urn:li:post:/, "");

  const author = data.author;
  let authorId = "";
  if (typeof author === "string") {
    authorId = author.replace("urn:li:person:", "");
  }

  let text = "";
  const textObj = data.text;
  if (typeof textObj === "string") {
    text = textObj;
  } else if (isRecord(textObj)) {
    text = extractLocalizedField(textObj) || extractString(textObj, "text");
  }
  const commentary = data.commentary;
  if (!text && typeof commentary === "string") {
    text = commentary;
  } else if (!text && isRecord(commentary)) {
    text = extractLocalizedField(commentary) || extractString(commentary, "text");
  }

  const lifecycleState = data.lifecycleState;
  let postType = "PUBLISHED";
  if (typeof lifecycleState === "string") {
    postType = lifecycleState.toUpperCase();
  }

  const visibility = data.visibility;
  let vis = "PUBLIC";
  if (typeof visibility === "string") {
    vis = visibility.toUpperCase();
  }

  const created = data.created;
  let createdAt = 0;
  if (typeof created === "number") createdAt = created * 1000;
  if (typeof created === "string") createdAt = Date.parse(created);

  const socialDetail = isRecord(data.socialDetail) ? data.socialDetail : null;
  const socialMetrics = socialDetail && isRecord(socialDetail.totalSocialDetail) ? socialDetail.totalSocialDetail : null;
  const likeCount = isRecord(socialMetrics) ? extractNumber(socialMetrics, "likeCount") || extractNumber(socialMetrics, "numLikes") : 0;
  const commentCount = isRecord(socialMetrics) ? extractNumber(socialMetrics, "commentCount") || extractNumber(socialMetrics, "numComments") : 0;

  return {
    id: `li-post:${simpleId}`,
    provider: "linkedin",
    providerPostId: simpleId,
    authorId,
    text,
    postType,
    visibility: vis,
    createdAt,
    likeCount,
    commentCount,
    modelVersion: "2026-05-16",
    raw: data,
  };
}

export function parsePostsResponse(response: unknown): { posts: NormalizedPost[]; nextStart: number | null; count: number } {
  if (!isRecord(response)) return { posts: [], nextStart: null, count: 0 };
  const elements = response.elements;
  if (!Array.isArray(elements)) return { posts: [], nextStart: null, count: 0 };
  const posts = elements.filter(isRecord).map(normalizePost);
  const paging = extractPaging(response);
  return { posts, ...paging };
}

export function extractPaging(response: Record<string, unknown>): { nextStart: number | null; count: number } {
  const paging = response.paging;
  if (!isRecord(paging)) return { nextStart: null, count: 0 };
  const count = typeof paging.count === "number" ? paging.count : 0;
  const links = paging.links;
  if (!Array.isArray(links) || links.length === 0) return { nextStart: null, count };
  const nextLink = links.find((l: any) => isRecord(l) && l.rel === "next");
  if (!nextLink || !isRecord(nextLink)) return { nextStart: null, count };
  const uri = nextLink.uri;
  if (typeof uri !== "string") return { nextStart: null, count };
  const match = uri.match(/start=(\d+)/);
  if (!match) return { nextStart: null, count };
  return { nextStart: Number(match[1]), count };
}

function extractLocalizedField(data: Record<string, unknown>): string {
  const keys = Object.keys(data);
  for (const key of keys) {
    const val = data[key];
    if (typeof val === "string") return val;
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(obj: Record<string, unknown>, field: string): string {
  const val = obj[field];
  return typeof val === "string" ? val : "";
}

function extractNumber(obj: Record<string, unknown>, field: string): number {
  const val = obj[field];
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") { const n = Number(val); return Number.isFinite(n) ? n : 0; }
  return 0;
}
