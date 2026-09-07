import { beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
const cases = [
  {
    op: "healthcheck",
    input: {},
    path: "/user/unread_count",
    method: "GET",
    out: "counts",
    expected: {
      replies: 0,
      mentions: 1,
      private_messages: 0,
    },
    body: null,
  },
  {
    op: "post.list",
    input: {
      limit: 10,
      pageCursor: "P42",
    },
    path: "/post/list?limit=10&page_cursor=P42",
    method: "GET",
    out: "posts",
    expected: [
      {
        post: {
          id: 42,
          name: "Hello",
          body: "Hello",
          community_id: 7,
          ap_id: "https://site.example/post/42",
        },
        creator: {
          id: 3,
          name: "writer",
        },
        community: {
          id: 7,
          name: "news",
        },
      },
    ],
    body: null,
  },
  {
    op: "post.get",
    input: {
      id: 42,
    },
    path: "/post?id=42",
    method: "GET",
    out: "post",
    expected: {
      post: {
        id: 42,
        name: "Hello",
        body: "Hello",
        community_id: 7,
        ap_id: "https://site.example/post/42",
      },
      creator: {
        id: 3,
        name: "writer",
      },
      community: {
        id: 7,
        name: "news",
      },
    },
    body: null,
  },
  {
    op: "post.create",
    input: {
      communityId: 7,
      name: "Hello",
      body: "Hello",
    },
    path: "/post",
    method: "POST",
    out: "post",
    expected: {
      post: {
        id: 42,
        name: "Hello",
        body: "Hello",
        community_id: 7,
        ap_id: "https://site.example/post/42",
      },
      creator: {
        id: 3,
        name: "writer",
      },
      community: {
        id: 7,
        name: "news",
      },
    },
    body: {
      community_id: 7,
      name: "Hello",
      body: "Hello",
    },
  },
  {
    op: "post.update",
    input: {
      postId: 42,
      name: "Hello",
    },
    path: "/post",
    method: "PUT",
    out: "post",
    expected: {
      post: {
        id: 42,
        name: "Hello",
        body: "Hello",
        community_id: 7,
        ap_id: "https://site.example/post/42",
      },
      creator: {
        id: 3,
        name: "writer",
      },
      community: {
        id: 7,
        name: "news",
      },
    },
    body: {
      post_id: 42,
      name: "Hello",
    },
  },
  {
    op: "comment.create",
    input: {
      postId: 42,
      content: "Hello",
    },
    path: "/comment",
    method: "POST",
    out: "comment",
    expected: {
      comment: {
        id: 12,
        post_id: 42,
        content: "Hello",
      },
    },
    body: {
      post_id: 42,
      content: "Hello",
    },
  },
  {
    op: "community.list",
    input: {
      page: 2,
      limit: 10,
    },
    path: "/community/list?page=2&limit=10",
    method: "GET",
    out: "communities",
    expected: [
      {
        community: {
          id: 7,
          name: "news",
          title: "News",
        },
      },
    ],
    body: null,
  },
];
let actions: ReturnType<typeof compileDeclarativeConnector>["actions"];
beforeAll(() => {
  expect(existsSync(new URL("../manifest.json", import.meta.url))).toBe(true);
  actions = compileDeclarativeConnector(
    JSON.parse(
      readFileSync(new URL("../manifest.json", import.meta.url), "utf8"),
    ),
  ).actions;
});
const credential = { host: "site.example", accessToken: "test-token" };
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"),
  );
for (const c of cases)
  describe(c.op, () => {
    it("validates echo without leaking undeclared input", async () => {
      const result = await actions[c.op]!({
        ...c.input,
        host: "site.example",
        ignored: "secret",
      });
      expect(result).toMatchObject(
        c.op === "healthcheck"
          ? { status: "ok", source: "connector" }
          : { validated: c.input, source: "connector" },
      );
      expect(JSON.stringify(result)).not.toContain("secret");
    });
    it("sends documented URL, method, auth and optional body; maps provider output", async () => {
      const calls: { url: string; init?: RequestInit }[] = [];
      const fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(fixture(c.op)), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-wp-total": "15",
            "x-wp-totalpages": "2",
          },
        });
      };
      const result = await actions[c.op]!({ ...credential, ...c.input, fetch });
      expect(calls).toHaveLength(1);
      const url = new URL(calls[0]!.url),
        expected = new URL("https://site.example/api/v3" + c.path);
      expect(url.origin + url.pathname).toBe(
        expected.origin + expected.pathname,
      );
      expect([...url.searchParams.entries()].sort()).toEqual(
        [...expected.searchParams.entries()].sort(),
      );
      expect(calls[0]!.init?.method).toBe(c.method);
      expect(new Headers(calls[0]!.init?.headers).get("Authorization")).toBe(
        "Bearer test-token",
      );
      expect(
        c.body === null
          ? calls[0]!.init?.body
          : JSON.parse(String(calls[0]!.init?.body)),
      ).toEqual(c.body === null ? undefined : c.body);
      expect(result).toMatchObject({ source: "provider", [c.out]: c.expected });
      if (c.op === "post.list")
        expect(result).toMatchObject({ nextCursor: "P43" });
    });
    it("surfaces provider permission errors", async () => {
      const fetch = async () =>
        new Response(JSON.stringify(fixture("error")), { status: 403 });
      await expect(
        actions[c.op]!({ ...credential, ...c.input, fetch }),
      ).rejects.toMatchObject({
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "not_logged_in",
      });
    });
    it("maps throttling with provider retry delay", async () => {
      const rate = fixture("rate_limit");
      const fetch = async () =>
        new Response(JSON.stringify(rate.body), {
          status: rate.status,
          headers: rate.headers,
        });
      await expect(
        actions[c.op]!({ ...credential, ...c.input, fetch }),
      ).rejects.toMatchObject({
        code: "CONNECTOR_RATE_LIMITED",
        retryAfterSeconds: 17,
      });
    });
  });
it("rejects malformed required input before fetching", async () => {
  const fetch = async () => {
    throw new Error("must not fetch");
  };
  await expect(
    actions["post.get"]!({ ...credential, id: "wrong type", fetch }),
  ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
});
it("classifies a transport failure", async () => {
  const fetch = async () => {
    throw new Error("network down");
  };
  await expect(
    actions.healthcheck!({ ...credential, fetch }),
  ).rejects.toMatchObject({ code: "CONNECTOR_UNAVAILABLE" });
});
it("omits absent list filters and the final cursor", async () => {
  const fetch = async (url: RequestInfo | URL) => {
    expect(String(url)).toBe("https://site.example/api/v3/post/list");
    return new Response(JSON.stringify({ posts: [], next_page: null }));
  };
  const result = (await actions["post.list"]!({
    ...credential,
    fetch,
  })) as Record<string, unknown>;
  expect(result.posts).toEqual([]);
  expect(result).not.toHaveProperty("nextCursor");
});
it("preserves false booleans and native language field names", async () => {
  const fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(JSON.parse(String(init?.body))).toEqual({
      post_id: 42,
      nsfw: false,
      language_id: 0,
    });
    return new Response(JSON.stringify(fixture("post.update")));
  };
  await actions["post.update"]!({
    ...credential,
    postId: 42,
    nsfw: false,
    languageId: 0,
    fetch,
  });
});

it("uses a conservative fallback when a throttle has no retry header", async () => {
  const fetch = async () => new Response("{}", { status: 429 });
  await expect(
    actions.healthcheck!({ ...credential, fetch }),
  ).rejects.toMatchObject({
    code: "CONNECTOR_RATE_LIMITED",
    retryAfterSeconds: 60,
  });
});
