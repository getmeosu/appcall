import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import usersListFixture from "../fixtures/users_list.json";
import getRefFixture from "../fixtures/get_ref.json";
import getRef404Fixture from "../fixtures/get_ref_404.json";
import { generateReleaseNotes, getGitRef, listUsers } from "../src/actions";
import { validateListUsersInput } from "../src/correctness_card18";

describe("github correctness card 18", () => {
  test("version is 0.77.0 at 797 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.77.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(797);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const op of Object.values(ops)) {
      kinds[op.kind as keyof typeof kinds] += 1;
      if (op.kind === "action") {
        if (op.sideEffect === "read") side.read += 1;
        else if (op.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 747, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 396, write: 336, absent: 15 });

    const notes = ops["releases.generate_notes"];
    expect(notes.sideEffect).toBe("read");
    expect(notes.effectPolicy).toBeUndefined();
    expect(notes.reconcile).toBeUndefined();
    expect(notes.effect).toBeUndefined();
    expect(String(notes.description)).toContain("POST /repos/{owner}/{repo}/releases/generate-notes");

    const list = ops["users.list"];
    expect(list).toBeDefined();
    expect(list.kind).toBe("action");
    expect(list.sideEffect).toBe("read");
    expect(list.effectPolicy).toBeUndefined();
    expect(list.reconcile).toBeUndefined();
    expect(list.effect).toBeUndefined();
    expect(String(list.description)).toContain("GET /users");
    expect(list.inputSchema.properties.since.type).toBe("number");
    expect(list.inputSchema.properties.perPage.type).toBe("number");

    const refs = ops["git.refs.get"];
    expect(String(refs.description)).toContain("GET /repos/{owner}/{repo}/git/ref/{ref}");
    expect(String(refs.description)).not.toContain("/git/refs/{ref}");
  });

  test("users.list validates since/perPage and hits GET /users", async () => {
    expect(validateListUsersInput({})).toEqual({});
    expect(validateListUsersInput({ since: 0, perPage: 10 })).toEqual({ since: 0, perPage: 10 });
    expect(() => validateListUsersInput({ since: -1 })).toThrow(/since/);
    expect(() => validateListUsersInput({ perPage: 0 })).toThrow(/perPage/);
    expect(() => validateListUsersInput("nope")).toThrow(/users.list/);

    const dry = listUsers({ since: 1, perPage: 2 });
    expect(dry.action).toBe("users.list");
    expect(dry.validated).toEqual({ since: 1, perPage: 2 });

    const requests: Request[] = [];
    const result = await listUsers({
      accessToken: "ghp_test",
      since: 1,
      perPage: 2,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(usersListFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/users?since=1&per_page=2");
    expect(requests[0].method).toBe("GET");
    const users = result.users as Record<string, unknown>[];
    expect(users).toHaveLength(2);
    expect(users[0].login).toBe("octocat");
    expect(users[0].id).toBe("gh-user:1");
    expect(users[1].login).toBe("hubot");
  });

  test("users.list maps 404 to upstream error", async () => {
    await expect(
      listUsers({
        accessToken: "ghp_test",
        fetch: async () => new Response("{}", { status: 404 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub users list was not found." });
  });

  test("releases.generate_notes stays a non-persisting POST with read sideEffect", async () => {
    const requests: Request[] = [];
    const result = await generateReleaseNotes({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      tagName: "v1.0.0",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ name: "v1.0.0", body: "notes" }), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/releases/generate-notes");
    expect(result).toMatchObject({ action: "releases.generate_notes", name: "v1.0.0", body: "notes" });
    expect(manifest.operations["releases.generate_notes"].sideEffect).toBe("read");
  });

  test("git.refs.get uses singular /git/ref path; fixture body url stays plural", async () => {
    const requests: Request[] = [];
    const result = await getGitRef({
      accessToken: "ghp_test",
      owner: "acme",
      repo: "app",
      ref: "refs/heads/main",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getRefFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/ref/heads/main");
    const ref = result.ref as Record<string, unknown>;
    expect(ref.url).toBe("https://api.github.com/repos/acme/app/git/refs/heads/main");
    expect(getRefFixture.url).toContain("/git/refs/");

    await expect(
      getGitRef({
        accessToken: "ghp_test",
        owner: "acme",
        repo: "app",
        ref: "heads/missing",
        fetch: async () => new Response(JSON.stringify(getRef404Fixture), { status: 404 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Ref not found." });
  });
});
