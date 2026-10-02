import { describe, expect, test } from "bun:test";
import getCommitStatusFixture from "../fixtures/get_commit_status.json";
import listCommitStatusesFixture from "../fixtures/list_commit_statuses.json";
import createCommitStatusFixture from "../fixtures/create_commit_status.json";
import getCommitFixture from "../fixtures/get_commit.json";
import { getCommitStatus, listCommitStatuses, createCommitStatus, getCommit } from "../src/actions";

describe("github commits actions", () => {
  test("getCommitStatus validates input", () => {
    const result = getCommitStatus({ owner: "acme", repo: "app", ref: "main" });
    expect(result.action).toBe("commits.status.get");
    expect(result.validated).toEqual({ owner: "acme", repo: "app", ref: "main" });
  });

  test("getCommitStatus fetches combined status", async () => {
    const requests: Request[] = [];
    const result = await getCommitStatus({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      ref: "main",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getCommitStatusFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/commits/main/status");
    expect((result.status as Record<string, unknown>).state).toBe("success");
    expect((result.status as Record<string, unknown>).totalCount).toBe(1);
  });

  test("listCommitStatuses fetches statuses array", async () => {
    const requests: Request[] = [];
    const result = await listCommitStatuses({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      ref: "abc123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listCommitStatusesFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/commits/abc123/statuses");
    expect((result.statuses as Record<string, unknown>[])[0].context).toBe("continuous-integration/jenkins");
  });

  test("createCommitStatus posts status and validates", async () => {
    const sync = createCommitStatus({
      owner: "acme",
      repo: "app",
      sha: "abc123def456abc123def456abc123def456abc1",
      state: "pending",
      context: "ci",
    });
    expect(sync.action).toBe("commits.statuses.create");

    const requests: Request[] = [];
    const result = await createCommitStatus({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      sha: "abc123def456abc123def456abc123def456abc1",
      state: "pending",
      description: "Build started",
      context: "continuous-integration/jenkins",
      targetUrl: "https://ci.example.com/2",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(createCommitStatusFixture), { status: 201 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/statuses/abc123def456abc123def456abc123def456abc1");
    const body = JSON.parse(await requests[0].text());
    expect(body.state).toBe("pending");
    expect(body.context).toBe("continuous-integration/jenkins");
    expect((result.status as Record<string, unknown>).state).toBe("pending");
  });

  test("createCommitStatus missing state throws", () => {
    expect(() => createCommitStatus({ owner: "acme", repo: "app", sha: "abc" })).toThrow("state is required");
  });

  test("createCommitStatus rejects invalid state", () => {
    expect(() =>
      createCommitStatus({ owner: "acme", repo: "app", sha: "abc", state: "shipped" })
    ).toThrow("state must be one of: error, failure, pending, success");
  });

  test("getCommitStatus accepts sha as ref alias", () => {
    const result = getCommitStatus({
      owner: "acme",
      repo: "app",
      sha: "abc123def456abc123def456abc123def456abc1",
    });
    expect(result.validated).toEqual({
      owner: "acme",
      repo: "app",
      ref: "abc123def456abc123def456abc123def456abc1",
    });
  });

  test("listCommitStatuses accepts sha as ref alias", () => {
    const result = listCommitStatuses({
      owner: "acme",
      repo: "app",
      sha: "abc123",
    });
    expect((result.validated as Record<string, unknown>).ref).toBe("abc123");
  });

  test("getCommit fetches a single commit", async () => {
    const requests: Request[] = [];
    const result = await getCommit({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      ref: "abc123def456abc123def456abc123def456abc1",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getCommitFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toContain("/repos/acme/app/commits/");
    expect((result.commit as Record<string, unknown>).sha).toBe("abc123def456abc123def456abc123def456abc1");
    expect((result.commit as Record<string, unknown>).message).toBe("feat: add dark mode support");
  });

  test("getCommit maps 404", async () => {
    await expect(
      getCommit({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        ref: "deadbeef",
        fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
