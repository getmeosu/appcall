import { describe, expect, it } from "bun:test";
import { normalizePost, parsePostsResponse, extractPaging } from "../src/posts";
import postsList from "../fixtures/posts_list.json";
import postsListNoPage from "../fixtures/posts_list_no_page.json";

describe("normalizePost", () => {
  const raw1 = postsList.elements[0] as any;
  const raw2 = postsList.elements[1] as any;

  it("maps post fields with text", () => {
    const p = normalizePost(raw1);
    expect(p.id).toBe("li-post:1234567890");
    expect(p.provider).toBe("linkedin");
    expect(p.providerPostId).toBe("1234567890");
    expect(p.authorId).toBe("abc123def");
    expect(p.text).toBe("Excited to announce our new product launch!");
    expect(p.postType).toBe("PUBLISHED");
    expect(p.visibility).toBe("PUBLIC");
    expect(p.likeCount).toBe(42);
    expect(p.commentCount).toBe(8);
  });

  it("extracts commentary as text fallback", () => {
    const p = normalizePost(raw2);
    expect(p.id).toBe("li-post:9876543210");
    expect(p.text).toBe("Just published a new article on engineering leadership.");
    expect(p.visibility).toBe("CONNECTIONS");
    expect(p.likeCount).toBe(15);
    expect(p.commentCount).toBe(3);
  });

  it("handles missing fields", () => {
    const p = normalizePost({});
    expect(p.id).toBe("li-post:");
    expect(p.providerPostId).toBe("");
    expect(p.authorId).toBe("");
    expect(p.text).toBe("");
    expect(p.likeCount).toBe(0);
  });
});

describe("parsePostsResponse", () => {
  it("parses posts with paging", () => {
    const result = parsePostsResponse(postsList);
    expect(result.posts).toHaveLength(2);
    expect(result.nextStart).toBe(10);
    expect(result.count).toBe(10);
  });

  it("returns no nextStart when no links", () => {
    const result = parsePostsResponse(postsListNoPage);
    expect(result.posts).toHaveLength(1);
    expect(result.nextStart).toBeNull();
  });

  it("handles null input", () => {
    const result = parsePostsResponse(null);
    expect(result.posts).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });
});

describe("extractPaging", () => {
  it("extracts next start from paging links", () => {
    const paging = extractPaging(postsList as any);
    expect(paging.nextStart).toBe(10);
    expect(paging.count).toBe(10);
  });

  it("returns null for missing paging", () => {
    expect(extractPaging({}).nextStart).toBeNull();
  });
});
