import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import member from "../fixtures/member.json";
import story from "../fixtures/story.json";
import stories from "../fixtures/stories.json";
import comment from "../fixtures/comment.json";
import search from "../fixtures/search.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status });

describe("shortcut HTTP contract", () => {
  test("uses Shortcut-Token and healthcheck accepts empty input", async () => {
    const seen: Request[] = [];
    const out = await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(member);
      },
    });
    expect(seen[0]!.headers.get("shortcut-token")).toBe("secret");
    expect(seen[0]!.url).toBe("https://api.app.shortcut.com/api/v3/member");
    expect(out).toMatchObject({ member });
  });

  test("encodes numeric path and rejects missing input before fetch", async () => {
    const seen: Request[] = [];
    await actions["projects.get"]!({
      apiKey: "secret",
      projectId: 3,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response({ id: 3 });
      },
    });
    expect(seen[0]!.url).toContain("/projects/3");
    await expect(actions["projects.get"]!({ apiKey: "secret", fetch: async () => response({}) })).rejects.toBeDefined();
  });

  test("maps upstream errors safely", async () => {
    await expect(
      actions["projects.list"]!({ apiKey: "secret", fetch: async () => response({ message: "bad secret" }, 401) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("shortcut write depth", () => {
  test("lists stories as a provider array", async () => {
    const seen: Request[] = [];
    const out = await actions["stories.list"]!({
      apiKey: "secret",
      projectId: 1,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(stories);
      },
    });
    expect(seen[0]!.url).toBe("https://api.app.shortcut.com/api/v3/projects/1/stories");
    expect(out.stories).toEqual(stories);
  });

  test("creates a story with JSON body and omits unset fields", async () => {
    const seen: Request[] = [];
    const out = await actions["stories.create"]!({
      apiKey: "secret",
      name: "Ship",
      workflow_state_id: 5001,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(story, 201);
      },
    });
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.url).toBe("https://api.app.shortcut.com/api/v3/stories");
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
    expect(await seen[0]!.json()).toEqual({ name: "Ship", workflow_state_id: 5001 });
    expect(out.story).toEqual(story);
  });

  test("rejects stories.create without a name before fetch", async () => {
    await expect(
      actions["stories.create"]!({ apiKey: "secret", workflow_state_id: 1, fetch: async () => response({}) }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("searches stories and maps the data wrapper", async () => {
    const seen: Request[] = [];
    const out = await actions["stories.search"]!({
      apiKey: "secret",
      query: "is:story",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(search);
      },
    });
    expect(new URL(seen[0]!.url).searchParams.get("query")).toBe("is:story");
    expect(out.stories).toEqual(search.data);
    expect(out.total).toBe(1);
  });

  test("creates a comment and deletes a story with 204", async () => {
    const seen: Request[] = [];
    const commentOut = await actions["comments.create"]!({
      apiKey: "secret",
      storyId: 2,
      text: "Looks good",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(comment, 201);
      },
    });
    const deleted = await actions["stories.delete"]!({
      apiKey: "secret",
      storyId: 2,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(null, 204);
      },
    });
    expect(seen[0]!.url).toBe("https://api.app.shortcut.com/api/v3/stories/2/comments");
    expect(commentOut.comment).toEqual(comment);
    expect(seen[1]!.method).toBe("DELETE");
    expect(deleted.deleted).toBe(true);
  });

  test("does not compile EventOnly webhook operations as HTTP actions", () => {
    expect(actions["webhook.story"]).toBeUndefined();
    expect(manifest.operations["webhook.story"].kind).toBe("webhook");
    expect(manifest.operations["webhook.epic"].request).toBeUndefined();
    expect(Object.keys(actions).sort()).toEqual([
      "comments.create",
      "comments.delete",
      "comments.list",
      "comments.update",
      "epics.create",
      "epics.get",
      "epics.list",
      "healthcheck",
      "iterations.list",
      "members.list",
      "projects.get",
      "projects.list",
      "stories.create",
      "stories.delete",
      "stories.get",
      "stories.list",
      "stories.search",
      "stories.update",
      "workflows.list",
    ]);
  });
});
