import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import {
  batchGetImages,
  deleteShare,
  getOrganizationPageStats,
  getVideos,
  publishPost,
  registerImageUpload,
  uploadVideo,
} from "../src/depth";
import { createPost } from "../src/actions";
import { healthcheck } from "../src/healthcheck";
import { executeOrganizationsListSync, executePostsListSync, executeProfileGetSync } from "../src/sync";
import COMPOSIO from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);
const HANDLERS: Record<string, (input: unknown) => unknown> = {
  "posts.publish": publishPost,
  "posts.share.delete": deleteShare,
  "images.batchGet": batchGetImages,
  "organizations.pageStats.get": getOrganizationPageStats,
  "videos.get": getVideos,
  "assets.registerUpload": registerImageUpload,
  "videos.upload": uploadVideo,
  "posts.create": createPost,
  healthcheck,
};

const ORIGIN = ["profile.get", "posts.list", "organizations.list", "posts.create", "healthcheck"];

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") input[key] = ["urn:li:image:x"];
    else if (prop.type === "object") input[key] = { text: "x" };
    else input[key] = "x";
  }
  return input;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
  const requests: Request[] = [];
  const action = compiled.actions[key] ?? HANDLERS[key];
  const result = await action!({
    accessToken: "token",
    ...input,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(url, init);
      requests.push(request);
      return respond(request);
    },
  });
  return { requests, result };
}

describe("linkedin depth manifest", () => {
  test("compiles the origin tree plus every Composio HTTP tool", () => {
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.http.baseUrl).toBe("https://api.linkedin.com");
    expect(manifest.http.auth).toMatchObject({ field: "accessToken", name: "Authorization", value: "Bearer {{accessToken}}" });
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
    expect(Object.keys(COMPOSIO)).toHaveLength(25);
    expect(Object.keys(operations)).toHaveLength(30);
    for (const key of ORIGIN) expect(operations[key], key).toBeDefined();
    for (const [slug, key] of Object.entries(COMPOSIO)) {
      const operation = operations[key];
      expect(operation, slug).toBeDefined();
      const runnable = operation.request || HANDLERS[key];
      expect(runnable, slug).toBeTruthy();
      if (operation.request) expect(compiled.actions[key], slug).toBeTypeOf("function");
      else expect(HANDLERS[key], slug).toBeTypeOf("function");
    }
  });

  test("keeps action metadata, budgets, and body rules", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.maxResponseBytes as number, key).toBeGreaterThanOrEqual(operation.maxInputBytes as number);
      if (operation.kind !== "action") continue;
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      const request = operation.request as { method?: string; path?: string; body?: unknown; headers?: Record<string, string> } | undefined;
      if (!request) continue;
      expect(typeof request.path, key).toBe("string");
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) expect(schema.required ?? [], key).toContain(placeholder);
      const method = String(request.method);
      const contentType = request.headers?.["Content-Type"];
      if (method === "GET" || method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(contentType, key).toBeUndefined();
      } else if (request.body !== undefined) {
        expect(contentType, key).toBe("application/json");
      }
    }
  });
});

describe("linkedin declarative calls", () => {
  test("every compiled operation hits api.linkedin.com", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
      const request = operation.request as { method: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ ok: true }, request.success?.[0] ?? 200, { "x-restli-id": "urn:li:share:1" }));
      expect(requests, key).toHaveLength(1);
      const sent = requests[0]!;
      expect(sent.method, key).toBe(request.method);
      const url = new URL(sent.url);
      expect(url.hostname, key).toBe("api.linkedin.com");
      expect(sent.headers.get("authorization"), key).toBe("Bearer token");
      expect(sent.headers.get("x-restli-protocol-version"), key).toBe("2.0.0");
      expect(sent.headers.get("accept"), key).toBe("application/json");
      if (url.pathname.startsWith("/rest/")) expect(sent.headers.get("linkedin-version"), key).toBe("202609");
      else expect(sent.headers.get("linkedin-version"), key).toBeNull();
      if (request.method === "GET" || request.method === "DELETE") {
        expect(sent.headers.get("content-type"), key).toBeNull();
        expect(await sent.text(), key).toBe("");
      } else {
        expect(sent.headers.get("content-type"), key).toBe("application/json");
      }
      expect(result, key).toMatchObject({ connector: "linkedin", action: key, source: "provider" });
    }
  });

  test("maps the documented LinkedIn paths", async () => {
    const article = await invoke(
      "shares.article.create",
      {
        author: "urn:li:person:abc",
        lifecycleState: "PUBLISHED",
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: "hi" }, shareMediaCategory: "ARTICLE" } },
      },
      () => jsonResponse({ id: "urn:li:ugcPost:1" }, 201, { "x-restli-id": "urn:li:ugcPost:1" }),
    );
    expect(new URL(article.requests[0]!.url).pathname).toBe("/v2/ugcPosts");
    expect(JSON.parse(await article.requests[0]!.text())).toEqual({
      author: "urn:li:person:abc",
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: "hi" }, shareMediaCategory: "ARTICLE" } },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    });

    const comment = await invoke(
      "comments.create",
      {
        actor: "urn:li:person:abc",
        object: "urn:li:share:55",
        target_urn: "urn:li:share:55",
        message: { text: "nice" },
        parent_comment: "urn:li:comment:(urn:li:share:55,9)",
      },
      () => jsonResponse({ id: "9" }, 201),
    );
    expect(new URL(comment.requests[0]!.url).pathname).toBe("/rest/socialActions/urn%3Ali%3Ashare%3A55/comments");
    expect(JSON.parse(await comment.requests[0]!.text()).parentComment).toBe("urn:li:comment:(urn:li:share:55,9)");

    const video = await invoke(
      "posts.video.create",
      { author: "urn:li:person:abc", video_urn: "urn:li:video:VID", commentary: "watch" },
      () => jsonResponse(null, 201, { "x-restli-id": "urn:li:share:77" }),
    );
    expect(new URL(video.requests[0]!.url).pathname).toBe("/rest/posts");
    const videoBody = JSON.parse(await video.requests[0]!.text());
    expect(videoBody.content.media).toEqual({ id: "urn:li:video:VID" });
    expect(videoBody.lifecycleState).toBe("PUBLISHED");
    expect(video.result).toMatchObject({ id: "urn:li:share:77" });

    const deleted = await invoke("posts.delete", { post_urn: "urn:li:share:77" }, () => jsonResponse({ message: "missing" }, 404));
    expect(deleted.requests[0]!.method).toBe("DELETE");
    expect(new URL(deleted.requests[0]!.url).pathname).toBe("/rest/posts/urn%3Ali%3Ashare%3A77");
    expect(deleted.result).toMatchObject({ deleted: true });

    const facets = await invoke("ads.targetingFacets.list", {}, () => jsonResponse({ elements: [] }));
    expect(new URL(facets.requests[0]!.url).pathname).toBe("/v2/adTargetingFacets");

    const audience = await invoke(
      "ads.audienceCounts.get",
      { q: "targetingCriteriaV2", targetingCriteria: "(include:(and:List((or:(urn:li:adTargetingFacet:locations:List(urn:li:geo:1))))))" },
      () => jsonResponse({ elements: [{ total: 10 }] }),
    );
    const audienceUrl = new URL(audience.requests[0]!.url);
    expect(audienceUrl.pathname).toBe("/v2/audienceCounts");
    expect(audienceUrl.searchParams.get("q")).toBe("targetingCriteriaV2");
    expect(audienceUrl.searchParams.get("targetingCriteria")).toBe("(include:(and:List((or:(urn:li:adTargetingFacet:locations:List(urn:li:geo:1))))))");

    const acls = await invoke("organizations.acls.list", { role: "ADMINISTRATOR", state: "APPROVED", start: 0, count: 10 }, () => jsonResponse({ elements: [] }));
    const aclsUrl = new URL(acls.requests[0]!.url);
    expect(aclsUrl.pathname).toBe("/rest/organizationAcls");
    expect(aclsUrl.searchParams.get("q")).toBe("roleAssignee");
    expect(aclsUrl.searchParams.get("role")).toBe("ADMINISTRATOR");
    expect(acls.requests[0]!.headers.get("x-restli-method")).toBe("FINDER");

    const image = await invoke("images.get", { image_urn: "urn:li:image:IMG" }, () => jsonResponse({ id: "urn:li:image:IMG", status: "AVAILABLE" }));
    expect(new URL(image.requests[0]!.url).pathname).toBe("/rest/images/urn%3Ali%3Aimage%3AIMG");

    const me = await invoke("profile.me.get", {}, () => jsonResponse({ id: "abc" }));
    expect(new URL(me.requests[0]!.url).pathname).toBe("/v2/me");
    const who = await invoke("profile.whoami", {}, () => jsonResponse({ sub: "abc", name: "Ada" }));
    expect(new URL(who.requests[0]!.url).pathname).toBe("/v2/userinfo");

    const network = await invoke("organizations.networkSize.get", { organization_id: "3803", edgeType: "COMPANY_FOLLOWED_BY_MEMBER" }, () => jsonResponse({ firstDegreeSize: 4 }));
    const networkUrl = new URL(network.requests[0]!.url);
    expect(networkUrl.pathname).toBe("/rest/networkSizes/urn:li:organization:3803");
    expect(networkUrl.searchParams.get("edgeType")).toBe("COMPANY_FOLLOWED_BY_MEMBER");

    const person = await invoke("people.get", { person_id: "abc123" }, () => jsonResponse({ id: "abc123" }));
    expect(new URL(person.requests[0]!.url).pathname).toBe("/v2/people/(id:abc123)");

    const post = await invoke("posts.get", { post_id: "urn:li:ugcPost:789", viewContext: "AUTHOR" }, () => jsonResponse({ id: "urn:li:ugcPost:789", commentary: "hi" }));
    const postUrl = new URL(post.requests[0]!.url);
    expect(postUrl.pathname).toBe("/rest/posts/urn%3Ali%3AugcPost%3A789");
    expect(postUrl.searchParams.get("viewContext")).toBe("AUTHOR");

    const stats = await invoke(
      "organizations.shareStats.get",
      { organizational_entity: "urn:li:organization:2414183", time_intervals: "(timeRange:(start:1,end:2),timeGranularityType:DAY)" },
      () => jsonResponse({ elements: [] }),
    );
    const statsUrl = new URL(stats.requests[0]!.url);
    expect(statsUrl.pathname).toBe("/rest/organizationalEntityShareStatistics");
    expect(statsUrl.searchParams.get("q")).toBe("organizationalEntity");
    expect(statsUrl.searchParams.get("organizationalEntity")).toBe("urn:li:organization:2414183");
    expect(statsUrl.searchParams.get("timeIntervals")).toBe("(timeRange:(start:1,end:2),timeGranularityType:DAY)");

    const init = await invoke("images.initializeUpload", { owner: "urn:li:person:abc" }, () => jsonResponse({ value: { image: "urn:li:image:1", uploadUrl: "https://www.linkedin.com/dms-uploads/a" } }));
    const initUrl = new URL(init.requests[0]!.url);
    expect(initUrl.pathname).toBe("/rest/images");
    expect(initUrl.searchParams.get("action")).toBe("initializeUpload");
    expect(JSON.parse(await init.requests[0]!.text())).toEqual({ initializeUploadRequest: { owner: "urn:li:person:abc" } });

    const reactions = await invoke(
      "reactions.list",
      { entity: "urn:li:activity:42", sort: "REVERSE_CHRONOLOGICAL", count: 5, start: 0 },
      () => jsonResponse({ elements: [] }),
    );
    const reactionsUrl = new URL(reactions.requests[0]!.url);
    expect(reactionsUrl.pathname).toBe("/rest/reactions/(entity:urn%3Ali%3Aactivity%3A42)");
    expect(reactionsUrl.searchParams.get("q")).toBe("entity");
    expect(reactionsUrl.searchParams.get("sort")).toBe("(value:REVERSE_CHRONOLOGICAL)");

    const search = await invoke(
      "ads.targetingEntities.search",
      { facet: "urn:li:adTargetingFacet:locations", query: "united states", queryVersion: "QUERY_USES_URNS", count: 2 },
      () => jsonResponse({ elements: [] }),
    );
    const searchUrl = new URL(search.requests[0]!.url);
    expect(searchUrl.pathname).toBe("/rest/adTargetingEntities");
    expect(searchUrl.searchParams.get("q")).toBe("typeahead");
    expect(searchUrl.searchParams.get("query")).toBe("united states");
    expect(searchUrl.searchParams.get("facet")).toBe("urn:li:adTargetingFacet:locations");
  });

  test("omits optional query and body fields", async () => {
    const acls = await invoke("organizations.acls.list", {}, () => jsonResponse({ elements: [] }));
    const url = new URL(acls.requests[0]!.url);
    expect(url.search).toBe("?q=roleAssignee");
    const article = await invoke(
      "shares.article.create",
      { author: "urn:li:person:abc", visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }, specificContent: { shareCommentary: { text: "hi" } } },
      () => jsonResponse({ id: "1" }, 201),
    );
    expect(JSON.parse(await article.requests[0]!.text()).lifecycleState).toBeUndefined();
  });

  test("rejects a missing required field and maps 429", async () => {
    expect(() => compiled.actions["comments.create"]!({ actor: "urn:li:person:abc" })).toThrow("object is required");
    await expect(invoke("profile.whoami", {}, () => jsonResponse({ message: "slow down" }, 429, { "retry-after": "9" }))).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 9,
    });
    await expect(invoke("profile.me.get", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("linkedin handwritten calls", () => {
  test("publishes text and image posts", async () => {
    const text = await invoke("posts.publish", { author: "urn:li:organization:5", commentary: "hello" }, () => jsonResponse(null, 201, { "x-restli-id": "urn:li:share:5" }));
    const textBody = JSON.parse(await text.requests[0]!.text());
    expect(new URL(text.requests[0]!.url).pathname).toBe("/rest/posts");
    expect(textBody).toMatchObject({ author: "urn:li:organization:5", commentary: "hello", visibility: "PUBLIC", lifecycleState: "PUBLISHED" });
    expect(textBody.content).toBeUndefined();
    expect(text.requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(text.requests[0]!.headers.get("linkedin-version")).toBe("202609");

    const images = await invoke(
      "posts.publish",
      { author: "urn:li:person:abc", commentary: "pics", images: ["urn:li:image:1", { id: "urn:li:image:2", altText: "two" }] },
      () => jsonResponse({ id: "urn:li:share:8" }, 201),
    );
    expect(JSON.parse(await images.requests[0]!.text()).content).toEqual({
      multiImage: { images: [{ id: "urn:li:image:1" }, { id: "urn:li:image:2", altText: "two" }] },
    });
  });

  test("deletes a legacy share id or URN without a body", async () => {
    const byUrn = await invoke("posts.share.delete", { share_id: "urn:li:share:7245341016004718592" }, () => jsonResponse(null, 204));
    expect(byUrn.requests[0]!.method).toBe("DELETE");
    expect(new URL(byUrn.requests[0]!.url).pathname).toBe("/v2/shares/7245341016004718592");
    expect(byUrn.requests[0]!.headers.get("content-type")).toBeNull();
    expect(byUrn.requests[0]!.headers.get("linkedin-version")).toBeNull();
    expect(byUrn.result).toMatchObject({ deleted: true });
    expect(() => deleteShare({ share_id: "urn:li:ugcPost:1" })).toThrow("share_id must be a numeric id");
  });

  test("batch-gets images and videos with Rest.li List syntax", async () => {
    const images = await invoke("images.batchGet", { ids: ["urn:li:image:A", "urn:li:image:B"] }, () => jsonResponse({ results: {} }));
    expect(images.requests[0]!.url).toBe("https://api.linkedin.com/rest/images?ids=List(urn%3Ali%3Aimage%3AA,urn%3Ali%3Aimage%3AB)");
    expect(images.requests[0]!.headers.get("x-restli-method")).toBe("BATCH_GET");
    expect(images.requests[0]!.headers.get("content-type")).toBeNull();

    const one = await invoke("videos.get", { video_urn: "urn:li:video:VID" }, () => jsonResponse({ id: "urn:li:video:VID", status: "AVAILABLE" }));
    expect(new URL(one.requests[0]!.url).pathname).toBe("/rest/videos/urn%3Ali%3Avideo%3AVID");
    const many = await invoke("videos.get", { video_ids: ["urn:li:video:A", "urn:li:video:B"] }, () => jsonResponse({ results: {} }));
    expect(many.requests[0]!.url).toBe("https://api.linkedin.com/rest/videos?ids=List(urn%3Ali%3Avideo%3AA,urn%3Ali%3Avideo%3AB)");
    await expect(invoke("videos.get", { video_urn: "urn:li:video:A", video_ids: ["urn:li:video:B"] }, () => jsonResponse({}))).rejects.toThrow("mutually exclusive");
    await expect(invoke("videos.get", {}, () => jsonResponse({}))).rejects.toThrow("video_urn or video_ids is required");
  });

  test("builds organization page statistic intervals", async () => {
    const ranged = await invoke(
      "organizations.pageStats.get",
      { organization: "urn:li:organization:2414183", timeRangeStart: 10, timeRangeEnd: 20, timeGranularityType: "MONTH" },
      () => jsonResponse({ elements: [] }),
    );
    const url = new URL(ranged.requests[0]!.url);
    expect(url.pathname).toBe("/rest/organizationPageStatistics");
    expect(url.searchParams.get("q")).toBe("organization");
    expect(url.searchParams.get("organization")).toBe("urn:li:organization:2414183");
    expect(url.searchParams.get("timeIntervals")).toBe("(timeRange:(start:10,end:20),timeGranularityType:MONTH)");
    expect(ranged.requests[0]!.method).toBe("GET");
    expect(ranged.requests[0]!.headers.get("content-type")).toBeNull();
    await expect(invoke("organizations.pageStats.get", { organization: "urn:li:organization:1", timeRangeStart: 1 }, () => jsonResponse({}))).rejects.toThrow("required together");
  });

  test("registers an image upload with the feedshare recipe by default", async () => {
    const registered = await invoke("assets.registerUpload", { owner_urn: "urn:li:person:abc" }, () => jsonResponse({ value: { asset: "urn:li:digitalmediaAsset:1" } }));
    const url = new URL(registered.requests[0]!.url);
    expect(url.pathname).toBe("/v2/assets");
    expect(url.searchParams.get("action")).toBe("registerUpload");
    expect(registered.requests[0]!.headers.get("linkedin-version")).toBeNull();
    expect(JSON.parse(await registered.requests[0]!.text())).toEqual({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: "urn:li:person:abc",
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    });
  });

  test("uploads a video through initialize, PUT, finalize, and one status read", async () => {
    const requests: Request[] = [];
    const result = await uploadVideo({
      accessToken: "token",
      owner: "urn:li:person:abc",
      video_base64: "aGVsbG8=",
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === "/rest/videos" && new URL(request.url).searchParams.get("action") === "initializeUpload") {
          return jsonResponse({
            value: {
              video: "urn:li:video:VID",
              uploadToken: "tok",
              uploadInstructions: [{ uploadUrl: "https://www.linkedin.com/dms-uploads/vid", firstByte: 0, lastByte: 4 }],
            },
          });
        }
        if (request.method === "PUT") return jsonResponse(null, 201, { etag: "\"part-1\"" });
        if (new URL(request.url).searchParams.get("action") === "finalizeUpload") return jsonResponse({ value: { video: "urn:li:video:VID" } });
        return jsonResponse({ id: "urn:li:video:VID", status: "AVAILABLE" });
      },
    });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      "POST /rest/videos",
      "PUT /dms-uploads/vid",
      "POST /rest/videos",
      "GET /rest/videos/urn%3Ali%3Avideo%3AVID",
    ]);
    expect(requests[1]!.headers.get("authorization")).toBeNull();
    expect(requests[1]!.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await requests[1]!.arrayBuffer())).toEqual(new Uint8Array(Buffer.from("hello")));
    expect(JSON.parse(await requests[2]!.text())).toEqual({
      finalizeUploadRequest: { video: "urn:li:video:VID", uploadToken: "tok", uploadedPartIds: ["part-1"] },
    });
    expect(result).toMatchObject({ connector: "linkedin", action: "videos.upload", source: "provider", data: { video: "urn:li:video:VID" } });
  });

  test("resolves a missing video owner from userinfo and refuses video_url", async () => {
    const seen: string[] = [];
    await uploadVideo({
      accessToken: "token",
      file: { data: "data:video/mp4;base64,aGVsbG8=" },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        seen.push(`${request.method} ${new URL(request.url).pathname}`);
        if (new URL(request.url).pathname === "/v2/userinfo") return jsonResponse({ sub: "member1" });
        if (new URL(request.url).searchParams.get("action") === "initializeUpload") {
          expect(JSON.parse(await request.clone().text()).initializeUploadRequest.owner).toBe("urn:li:person:member1");
          return jsonResponse({
            value: { video: "urn:li:video:VID", uploadToken: "", uploadInstructions: [{ uploadUrl: "https://www.linkedin.com/dms-uploads/vid", firstByte: 0, lastByte: 4 }] },
          });
        }
        if (request.method === "PUT") return jsonResponse(null, 201, { etag: "p" });
        if (new URL(request.url).searchParams.get("action") === "finalizeUpload") return jsonResponse({});
        return jsonResponse({ status: "PROCESSING" });
      },
    });
    expect(seen[0]).toBe("GET /v2/userinfo");
    expect(seen.filter((line) => line.startsWith("GET /rest/videos"))).toHaveLength(3);
    expect(() => uploadVideo({ accessToken: "token", video_url: "https://evil.example/a.mp4" })).toThrow("video_url is not fetched");
    expect(() => uploadVideo({ video_url: "https://cdn.example/a.mp4" })).toThrow("video_url is not fetched");
    expect(() => uploadVideo({ file: { s3key: "bucket/key" } })).toThrow("file.s3key is not readable");
  });

  test("echoes validation without a credential", () => {
    const echoed = publishPost({ author: "urn:li:person:abc", commentary: "hi" }) as { source: string; validated: { commentary: string } };
    expect(echoed.source).toBe("connector");
    expect(echoed.validated.commentary).toBe("hi");
    expect(() => publishPost({ commentary: "hi" })).toThrow("author is required");
    expect(healthcheck().status).toBe("ok");
  });
});

describe("linkedin success fixtures", () => {
  const caseDir = join(import.meta.dir, "../fixtures/cases");

  test("every operation has one success fixture", () => {
    const covered = new Set<string>();
    for (const file of readdirSync(caseDir)) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as { operation: string; expected: { kind: string } };
      if (raw.expected.kind === "success") covered.add(raw.operation);
      const exchanges = (raw as { exchanges?: Array<{ request?: { body?: unknown } }> }).exchanges ?? [];
      for (const exchange of exchanges) {
        const body = exchange.request?.body;
        if (body === undefined || body === null) continue;
        expect(typeof body, file).toBe("string");
        expect(() => JSON.parse(body as string), file).not.toThrow();
        expect(JSON.stringify(JSON.parse(body as string)), file).toBe(body);
      }
    }
    expect([...covered].sort()).toEqual(Object.keys(operations).sort());
  });

  test("replays every success fixture", async () => {
    const userinfo = JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/profile_userinfo.json"), "utf8"));
    const posts = JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/posts_list.json"), "utf8"));
    const orgs = JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/organizations_list.json"), "utf8"));
    const locals: Record<string, unknown> = {
      "profile.get": executeProfileGetSync({ response: userinfo }),
      "posts.list": executePostsListSync({ response: posts }),
      "organizations.list": executeOrganizationsListSync({ response: orgs }),
      healthcheck: healthcheck(),
    };
    for (const file of readdirSync(caseDir).sort()) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input?: Record<string, unknown>;
        credentials?: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers: Record<string, string>; body: string | null; byteLength?: number };
          response: { status: number; headers?: Record<string, string>; bodyFile?: string };
        }>;
        expected: { resultFile: string };
      };
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      if (raw.exchanges.length === 0) {
        expect(locals[raw.operation], raw.id).toEqual(expected);
        continue;
      }
      let index = 0;
      const action = compiled.actions[raw.operation] ?? HANDLERS[raw.operation];
      const result = await action!({
        ...raw.input,
        ...raw.credentials,
        fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
          const exchange = raw.exchanges[index++];
          if (!exchange) throw new Error(`${raw.id} extra request`);
          const actualUrl = String(url instanceof URL ? url.toString() : url);
          const method = String(init?.method ?? "GET").toUpperCase();
          if (method !== exchange.request.method || actualUrl !== exchange.request.url) {
            throw new Error(`${raw.id}: ${method} ${actualUrl} != ${exchange.request.method} ${exchange.request.url}`);
          }
          const body = init?.body;
          if (typeof exchange.request.byteLength === "number") {
            if (!(body instanceof Uint8Array) || body.byteLength !== exchange.request.byteLength) {
              throw new Error(`${raw.id}: byte length ${body instanceof Uint8Array ? body.byteLength : "none"}`);
            }
          } else if (exchange.request.body === null) {
            if (body != null && body !== "") throw new Error(`${raw.id}: unexpected body`);
          } else if (body !== exchange.request.body) {
            throw new Error(`${raw.id}: body ${String(body)}`);
          }
          const got = new Headers(init?.headers);
          for (const [key, value] of Object.entries(exchange.request.headers)) {
            if (got.get(key) !== value) throw new Error(`${raw.id}: header ${key}=${got.get(key)} != ${value}`);
          }
          const payload = exchange.response.bodyFile
            ? readFileSync(join(dirname(join(caseDir, file)), exchange.response.bodyFile))
            : null;
          return new Response(payload, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(index, raw.id).toBe(raw.exchanges.length);
      expect(result, raw.id).toEqual(expected);
    }
  });
});

describe("linkedin origin fixtures still parse", () => {
  test("profile, posts, and organizations", () => {
    const profile = JSON.parse(readFileSync(new URL("../fixtures/profile_userinfo.json", import.meta.url), "utf8"));
    const posts = JSON.parse(readFileSync(new URL("../fixtures/posts_list.json", import.meta.url), "utf8"));
    const orgs = JSON.parse(readFileSync(new URL("../fixtures/organizations_list.json", import.meta.url), "utf8"));
    expect(executeProfileGetSync({ response: profile }).items).toHaveLength(1);
    expect(executePostsListSync({ response: posts }).items).toHaveLength(2);
    expect(executeOrganizationsListSync({ response: orgs }).items[0]!.name).toBe("TechCo Inc");
  });
});
