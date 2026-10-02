import { describe, expect, test } from "bun:test";
import putContentsFixture from "../fixtures/put_contents.json";
import deleteContentsFixture from "../fixtures/delete_contents.json";
import createBlobFixture from "../fixtures/create_blob.json";
import getBlobFixture from "../fixtures/get_blob.json";
import createTreeFixture from "../fixtures/create_tree.json";
import getTreeFixture from "../fixtures/get_tree.json";
import createRefFixture from "../fixtures/create_ref.json";
import updateRefFixture from "../fixtures/update_ref.json";
import createGitCommitFixture from "../fixtures/create_git_commit.json";
import getRefFixture from "../fixtures/get_ref.json";
import getGitCommitFixture from "../fixtures/get_git_commit.json";
import {
  putContents,
  deleteContents,
  pushFiles,
  createGitBlob,
  getGitBlob,
  createGitTree,
  getGitTree,
  createGitRef,
  updateGitRef,
  createGitCommit,
  getRepoTree,
} from "../src/actions";

describe("github S5 contents-write actions", () => {
  test("putContents validates and PUTs file", async () => {
    const sync = putContents({
      owner: "acme",
      repo: "app",
      path: "hello.txt",
      message: "add hello.txt",
      content: "aGVsbG8gd29ybGQK",
      branch: "main",
    });
    expect(sync.action).toBe("contents.put");

    const requests: Request[] = [];
    const result = await putContents({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      path: "hello.txt",
      message: "add hello.txt",
      content: "aGVsbG8gd29ybGQK",
      branch: "main",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(putContentsFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/contents/hello.txt");
    const body = JSON.parse(await requests[0].text());
    expect(body.message).toBe("add hello.txt");
    expect(body.content).toBe("aGVsbG8gd29ybGQK");
    expect(body.branch).toBe("main");
    expect((result.content as Record<string, unknown>).path).toBe("hello.txt");
    expect((result.content as Record<string, unknown>).commitSha).toBe("abc123def456abc123def456abc123def456abc1");
  });

  test("putContents accepts ref as branch alias", () => {
    const sync = putContents({
      owner: "acme",
      repo: "app",
      path: "hello.txt",
      message: "msg",
      content: "YQ==",
      ref: "main",
    });
    expect((sync.validated as Record<string, unknown>).branch).toBe("main");
  });

  test("putContents missing content throws", () => {
    expect(() =>
      putContents({ owner: "acme", repo: "app", path: "hello.txt", message: "msg" })
    ).toThrow("content is required");
  });

  test("deleteContents DELETEs file", async () => {
    const requests: Request[] = [];
    const result = await deleteContents({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      path: "hello.txt",
      message: "delete hello.txt",
      sha: "3b18e512dba79e4c8300dd08aeb37f8e7289a0d1",
      branch: "main",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(deleteContentsFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/contents/hello.txt");
    expect(result.deleted).toBe(true);
    expect(result.path).toBe("hello.txt");
  });

  test("deleteContents missing sha throws", () => {
    expect(() =>
      deleteContents({ owner: "acme", repo: "app", path: "hello.txt", message: "msg" })
    ).toThrow("sha is required");
  });

  test("pushFiles composes git data API", async () => {
    const requests: Request[] = [];
    const result = await pushFiles({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      branch: "main",
      message: "chore: push files",
      files: [
        { path: "hello.txt", content: "hello world\n" },
        { path: "bye.txt", content: "bye\n" },
      ],
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        const url = req.url;
        if (url.endsWith("/git/ref/heads/main") && req.method === "GET") {
          return new Response(JSON.stringify(getRefFixture), { status: 200 });
        }
        if (url.includes("/git/commits/abc123") && req.method === "GET") {
          return new Response(JSON.stringify(getGitCommitFixture), { status: 200 });
        }
        if (url.endsWith("/git/blobs") && req.method === "POST") {
          return new Response(JSON.stringify(createBlobFixture), { status: 201 });
        }
        if (url.endsWith("/git/trees") && req.method === "POST") {
          return new Response(JSON.stringify(createTreeFixture), { status: 201 });
        }
        if (url.endsWith("/git/commits") && req.method === "POST") {
          return new Response(JSON.stringify(createGitCommitFixture), { status: 201 });
        }
        if (url.includes("/git/refs/heads/main") && req.method === "PATCH") {
          return new Response(JSON.stringify(updateRefFixture), { status: 200 });
        }
        return new Response(JSON.stringify({ message: "unexpected " + req.method + " " + url }), { status: 500 });
      },
    });
    expect(requests.length).toBe(7); // ref + commit + 2 blobs + tree + commit + update ref
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/ref/heads/main");
    expect(requests[2].method).toBe("POST");
    expect(requests[2].url).toBe("https://api.github.com/repos/acme/app/git/blobs");
    expect(requests[4].url).toBe("https://api.github.com/repos/acme/app/git/trees");
    expect(requests[5].url).toBe("https://api.github.com/repos/acme/app/git/commits");
    expect(requests[6].method).toBe("PATCH");
    expect((result.commit as Record<string, unknown>).sha).toBe("newcommitsha0123456789abcdef0123456789ab");
    expect((result.commit as Record<string, unknown>).files).toEqual(["hello.txt", "bye.txt"]);
  });

  test("pushFiles empty files throws", () => {
    expect(() =>
      pushFiles({ owner: "acme", repo: "app", branch: "main", message: "msg", files: [] })
    ).toThrow("files must be a non-empty array");
  });

  test("createGitBlob POSTs blob", async () => {
    const requests: Request[] = [];
    const result = await createGitBlob({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      content: "hello world\n",
      encoding: "utf-8",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(createBlobFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/blobs");
    expect((result.blob as Record<string, unknown>).sha).toBe("3b18e512dba79e4c8300dd08aeb37f8e7289a0d1");
  });

  test("getGitBlob fetches blob", async () => {
    const requests: Request[] = [];
    const result = await getGitBlob({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      fileSha: "3b18e512dba79e4c8300dd08aeb37f8e7289a0d1",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getBlobFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe(
      "https://api.github.com/repos/acme/app/git/blobs/3b18e512dba79e4c8300dd08aeb37f8e7289a0d1"
    );
    expect((result.blob as Record<string, unknown>).encoding).toBe("base64");
  });

  test("createGitTree POSTs tree", async () => {
    const requests: Request[] = [];
    const result = await createGitTree({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      baseTree: "basetree000aaa111bbb222ccc333ddd444eee5",
      tree: [{ path: "hello.txt", mode: "100644", type: "blob", sha: "3b18e512dba79e4c8300dd08aeb37f8e7289a0d1" }],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(createTreeFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    const body = JSON.parse(await requests[0].text());
    expect(body.base_tree).toBe("basetree000aaa111bbb222ccc333ddd444eee5");
    expect((result.tree as Record<string, unknown>).sha).toBe("tree111aaa222bbb333ccc444ddd555eee666fff7");
  });

  test("getGitTree and getRepoTree fetch tree recursive", async () => {
    for (const [fn, action] of [
      [getGitTree, "git.trees.get"],
      [getRepoTree, "repos.tree.get"],
    ] as const) {
      const requests: Request[] = [];
      const result = await fn({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        treeSha: "tree111aaa222bbb333ccc444ddd555eee666fff7",
        recursive: true,
        fetch: async (input, init) => {
          requests.push(new Request(input, init));
          return new Response(JSON.stringify(getTreeFixture), { status: 200 });
        },
      });
      expect(result.action).toBe(action);
      expect(requests[0].url).toBe(
        "https://api.github.com/repos/acme/app/git/trees/tree111aaa222bbb333ccc444ddd555eee666fff7?recursive=1"
      );
      expect(((result.tree as Record<string, unknown>).tree as unknown[]).length).toBe(2);
    }
  });

  test("createGitRef POSTs ref", async () => {
    const requests: Request[] = [];
    const result = await createGitRef({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      ref: "heads/feature/s5",
      sha: "abc123def456abc123def456abc123def456abc1",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(createRefFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    const body = JSON.parse(await requests[0].text());
    expect(body.ref).toBe("refs/heads/feature/s5");
    expect((result.ref as Record<string, unknown>).sha).toBe("abc123def456abc123def456abc123def456abc1");
  });

  test("updateGitRef PATCHes ref", async () => {
    const requests: Request[] = [];
    const result = await updateGitRef({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      ref: "refs/heads/main",
      sha: "newcommitsha0123456789abcdef0123456789ab",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(updateRefFixture), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/refs/heads/main");
    expect((result.ref as Record<string, unknown>).sha).toBe("newcommitsha0123456789abcdef0123456789ab");
  });

  test("createGitCommit POSTs commit", async () => {
    const requests: Request[] = [];
    const result = await createGitCommit({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      message: "chore: push files",
      tree: "tree111aaa222bbb333ccc444ddd555eee666fff7",
      parents: ["abc123def456abc123def456abc123def456abc1"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(createGitCommitFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/commits");
    expect((result.commit as Record<string, unknown>).sha).toBe("newcommitsha0123456789abcdef0123456789ab");
  });

  test("createGitBlob maps 422", async () => {
    await expect(
      createGitBlob({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        content: "x",
        fetch: async () => new Response(JSON.stringify({ message: "Validation Failed" }), { status: 422 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
