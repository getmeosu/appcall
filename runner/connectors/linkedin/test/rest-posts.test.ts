import { describe, expect, it } from "bun:test";
import { escapeLittleText, isPostsAccessDenied, restPostBody, restliId, ugcTextShareBody } from "../src/rest-posts";

describe("escapeLittleText (little text format)", () => {
  it("backslash-escapes every reserved character", () => {
    for (const char of ["|", "{", "}", "@", "[", "]", "(", ")", "<", ">", "#", "\\", "*", "_", "~"]) {
      expect(escapeLittleText(char)).toBe(`\\${char}`);
    }
  });

  it("escapes the recipe vector in one pass", () => {
    expect(escapeLittleText("Hi (team) @all [x] {y} <z> #tag a*b_c~d|e\\f"))
      .toBe("Hi \\(team\\) \\@all \\[x\\] \\{y\\} \\<z\\> \\#tag a\\*b\\_c\\~d\\|e\\\\f");
  });

  it("does not double-escape an existing backslash escape", () => {
    expect(escapeLittleText("\\(")).toBe("\\\\\\(");
    expect(escapeLittleText("a\\\\b")).toBe("a\\\\\\\\b");
  });

  it("leaves plain text, unicode, and unreserved punctuation alone", () => {
    const plain = "Hello, world! It's 50% off: 1+1=2 & \"quotes\" / slash ? ; ' é 🚀 C$ ^ = `tick`";
    expect(escapeLittleText(plain)).toBe(plain);
    expect(escapeLittleText("")).toBe("");
  });

  it("escapes mention and hashtag syntax so it stays literal", () => {
    expect(escapeLittleText("@[Jane](urn:li:person:abc)")).toBe("\\@\\[Jane\\]\\(urn:li:person:abc\\)");
    expect(escapeLittleText("C# rocks #launch")).toBe("C\\# rocks \\#launch");
    expect(escapeLittleText("{hashtag|\\#|launch}")).toBe("\\{hashtag\\|\\\\\\#\\|launch\\}");
  });

  it("escapes repeated and adjacent reserved characters", () => {
    expect(escapeLittleText("**bold** __u__ ~~s~~")).toBe("\\*\\*bold\\*\\* \\_\\_u\\_\\_ \\~\\~s\\~\\~");
    expect(escapeLittleText("<<>>")).toBe("\\<\\<\\>\\>");
  });
});

describe("isPostsAccessDenied", () => {
  const denied = { status: 403, serviceErrorCode: 100, code: "ACCESS_DENIED", message: "Not enough permissions to access: partnerApiPostsExternal.CREATE.20260901" };
  it("is true only for 403 ACCESS_DENIED", () => {
    expect(isPostsAccessDenied(403, denied)).toBe(true);
    expect(isPostsAccessDenied(403, { code: "ACCESS_DENIED" })).toBe(true);
    expect(isPostsAccessDenied(403, { serviceErrorCode: 100, message: "Not enough permissions to access: partnerApiPostsExternal.CREATE.20260901" })).toBe(true);
  });
  it("is false for other statuses, codes, and shapes", () => {
    expect(isPostsAccessDenied(401, denied)).toBe(false);
    expect(isPostsAccessDenied(400, denied)).toBe(false);
    expect(isPostsAccessDenied(422, denied)).toBe(false);
    expect(isPostsAccessDenied(429, denied)).toBe(false);
    expect(isPostsAccessDenied(403, { ...denied, code: "FORBIDDEN" })).toBe(false);
    expect(isPostsAccessDenied(403, { ...denied, serviceErrorCode: 65600 })).toBe(false);
    expect(isPostsAccessDenied(403, { serviceErrorCode: 100, message: "Member is restricted" })).toBe(false);
    expect(isPostsAccessDenied(403, "")).toBe(false);
    expect(isPostsAccessDenied(403, null)).toBe(false);
    expect(isPostsAccessDenied(403, "ACCESS_DENIED")).toBe(false);
  });
});

describe("shared Posts helpers", () => {
  it("builds the base body in wire order with defaults", () => {
    expect(JSON.stringify(restPostBody({ author: "urn:li:person:a", commentary: "c" }))).toBe(
      '{"author":"urn:li:person:a","commentary":"c","visibility":"PUBLIC","distribution":{"feedDistribution":"MAIN_FEED","targetEntities":[],"thirdPartyDistributionChannels":[]},"lifecycleState":"PUBLISHED"}',
    );
  });
  it("reads x-restli-id case-insensitively", () => {
    expect(restliId({ "x-restli-id": "urn:li:share:1" })).toBe("urn:li:share:1");
    expect(restliId({ "X-RestLi-Id": "urn:li:share:2" })).toBe("urn:li:share:2");
    expect(restliId({})).toBe("");
  });
  it("builds the corrected UGC text-share body with plain (unescaped) text", () => {
    expect(ugcTextShareBody("urn:li:person:a", "Hi (x) #y", "CONNECTIONS")).toEqual({
      author: "urn:li:person:a",
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: "Hi (x) #y" }, shareMediaCategory: "NONE" } },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "CONNECTIONS" },
    });
  });
});
