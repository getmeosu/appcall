import { beforeAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
const cases = [
  {
    op: "healthcheck",
    input: {},
    path: "/users/me",
    method: "GET",
    out: "user",
    expected: {
      id: 3,
      name: "Writer",
      slug: "writer",
    },
    body: null,
  },
  {
    op: "post.list",
    input: {
      page: 2,
      perPage: 10,
      search: "hello world",
    },
    path: "/posts?page=2&per_page=10&search=hello+world",
    method: "GET",
    out: "posts",
    expected: [
      {
        id: 42,
        title: {
          rendered: "Hello",
        },
        content: {
          rendered: "<p>Hello</p>",
        },
        status: "draft",
        link: "https://site.example/?p=42",
      },
    ],
    body: null,
  },
  {
    op: "post.get",
    input: {
      id: 42,
    },
    path: "/posts/42",
    method: "GET",
    out: "post",
    expected: {
      id: 42,
      title: {
        rendered: "Hello",
      },
      content: {
        rendered: "<p>Hello</p>",
      },
      status: "draft",
      link: "https://site.example/?p=42",
    },
    body: null,
  },
  {
    op: "post.create",
    input: {
      title: "Hello",
      content: "Hello",
      status: "draft",
    },
    path: "/posts",
    method: "POST",
    out: "post",
    expected: {
      id: 42,
      title: {
        rendered: "Hello",
      },
      content: {
        rendered: "<p>Hello</p>",
      },
      status: "draft",
      link: "https://site.example/?p=42",
    },
    body: {
      title: "Hello",
      content: "Hello",
      status: "draft",
    },
  },
  {
    op: "post.update",
    input: {
      id: 42,
      title: "Hello",
    },
    path: "/posts/42",
    method: "POST",
    out: "post",
    expected: {
      id: 42,
      title: {
        rendered: "Hello",
      },
      content: {
        rendered: "<p>Hello</p>",
      },
      status: "draft",
      link: "https://site.example/?p=42",
    },
    body: {
      title: "Hello",
    },
  },
  {
    op: "page.list",
    input: {
      page: 2,
      perPage: 10,
    },
    path: "/pages?page=2&per_page=10",
    method: "GET",
    out: "pages",
    expected: [
      {
        id: 10,
        title: {
          rendered: "About",
        },
        type: "page",
      },
    ],
    body: null,
  },
  {
    op: "category.list",
    input: {
      page: 2,
      perPage: 10,
    },
    path: "/categories?page=2&per_page=10",
    method: "GET",
    out: "categories",
    expected: [
      {
        id: 7,
        name: "News",
        slug: "news",
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
const credential = {
  host: "site.example",
  username: "writer",
  applicationPassword: "test-password",
  basicAuth: "d3JpdGVyOnRlc3QtcGFzc3dvcmQ=",
};
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
          status: c.op === "post.create" ? 201 : 200,
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
        expected = new URL("https://site.example/wp-json/wp/v2" + c.path);
      expect(url.origin + url.pathname).toBe(
        expected.origin + expected.pathname,
      );
      expect([...url.searchParams.entries()].sort()).toEqual(
        [...expected.searchParams.entries()].sort(),
      );
      expect(calls[0]!.init?.method).toBe(c.method);
      expect(new Headers(calls[0]!.init?.headers).get("Authorization")).toBe(
        "Basic d3JpdGVyOnRlc3QtcGFzc3dvcmQ=",
      );
      expect(
        c.body === null
          ? calls[0]!.init?.body
          : JSON.parse(String(calls[0]!.init?.body)),
      ).toEqual(c.body === null ? undefined : c.body);
      expect(result).toMatchObject({ source: "provider", [c.out]: c.expected });
      if (c.op.endsWith(".list"))
        expect(result).toMatchObject({ total: "15", totalPages: "2" });
    });
    it("surfaces provider permission errors", async () => {
      const fetch = async () =>
        new Response(JSON.stringify(fixture("error")), { status: 403 });
      await expect(
        actions[c.op]!({ ...credential, ...c.input, fetch }),
      ).rejects.toMatchObject({
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Access denied",
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
it("omits absent list filters and missing pagination headers", async () => {
  const fetch = async (url: RequestInfo | URL) => {
    expect(String(url)).toBe("https://site.example/wp-json/wp/v2/posts");
    return new Response("[]");
  };
  const result = (await actions["post.list"]!({
    ...credential,
    fetch,
  })) as Record<string, unknown>;
  expect(result.posts).toEqual([]);
  expect(result).not.toHaveProperty("totalPages");
});
it("rejects an unsupported publishing status before fetch", async () => {
  const fetch = async () => {
    throw new Error("must not fetch");
  };
  await expect(
    actions["post.create"]!({
      ...credential,
      title: "Hello",
      status: "invalid",
      fetch,
    }),
  ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
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
