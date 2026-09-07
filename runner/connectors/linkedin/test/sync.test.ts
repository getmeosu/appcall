import { describe, expect, it } from "bun:test";
import { executeProfileGetSync, executePostsListSync, executeOrganizationsListSync } from "../src/sync";
import profileFixture from "../fixtures/profile.json";
import postsList from "../fixtures/posts_list.json";
import postsListNoPage from "../fixtures/posts_list_no_page.json";
import orgsList from "../fixtures/organizations_list.json";

describe("profile.get sync", () => {
  it("returns normalized profile", () => {
    const result = executeProfileGetSync({ response: profileFixture });
    expect(result.provider).toBe("linkedin");
    expect(result.operation).toBe("profile.get");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("li-profile:abc123def");
    expect(result.items[0].firstName).toBe("Jane");
  });

  it("returns empty for invalid profile", () => {
    const result = executeProfileGetSync({ response: null });
    expect(result.items).toHaveLength(0);
  });
});

describe("posts.list sync", () => {
  it("returns normalized posts with cursor", () => {
    const result = executePostsListSync({ response: postsList });
    expect(result.provider).toBe("linkedin");
    expect(result.operation).toBe("posts.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("li-post:1234567890");
    expect(result.nextStart).toBe(10);
  });

  it("returns no cursor on last page", () => {
    const result = executePostsListSync({ response: postsListNoPage });
    expect(result.items).toHaveLength(1);
    expect(result.nextStart).toBeNull();
  });
});

describe("organizations.list sync", () => {
  it("returns normalized organizations with cursor", () => {
    const result = executeOrganizationsListSync({ response: orgsList });
    expect(result.provider).toBe("linkedin");
    expect(result.operation).toBe("organizations.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("li-org:555666777");
    expect(result.items[0].name).toBe("TechCo Inc");
    expect(result.nextStart).toBe(10);
  });
});
