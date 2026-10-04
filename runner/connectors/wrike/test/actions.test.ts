import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import contacts from "../fixtures/contacts.json";
import comments from "../fixtures/comments.json";
import task from "../fixtures/task.json";
import folder from "../fixtures/folder.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Wrike read-only contract", () => {
  test("healthcheck sends bearer and maps data", async () => {
    const seen: Request[] = [];
    const r = await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(contacts);
      },
    });
    expect(seen[0].url).toBe("https://www.wrike.com/api/v4/contacts?me=true");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(r.contacts).toEqual(contacts.data);
  });

  test("encodes path and omits missing query values", async () => {
    const seen: Request[] = [];
    await actions["folders.get"]!({
      apiKey: "tok",
      folderId: "a/b?c",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response({ data: [] });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/v4/folders/a%2Fb%3Fc");
    expect(seen).toHaveLength(1);
  });

  test("maps rate limits and rejects malformed output", async () => {
    await expect(
      actions["contacts.list"]!({ apiKey: "tok", fetch: async () => response({ data: {} }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(
      actions["contacts.list"]!({
        apiKey: "secret",
        fetch: async () => response({ message: "x", secret: "secret" }, 429, { "Retry-After": "7" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
  });
});

describe("Wrike write depth", () => {
  test("creates a task with title query on the parent folder", async () => {
    const seen: Request[] = [];
    const r = await actions["tasks.create"]!({
      apiKey: "tok",
      folderId: "f-1",
      title: "Ship",
      status: "Active",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(task);
      },
    });
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("POST");
    expect(url.pathname).toBe("/api/v4/folders/f-1/tasks");
    expect(url.searchParams.get("title")).toBe("Ship");
    expect(url.searchParams.get("status")).toBe("Active");
    expect(url.searchParams.has("description")).toBe(false);
    expect(r.tasks).toEqual(task.data);
  });

  test("rejects tasks.create without title before fetch", async () => {
    await expect(
      actions["tasks.create"]!({ apiKey: "tok", folderId: "f-1", fetch: async () => response({}) }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("updates and deletes tasks", async () => {
    const seen: Request[] = [];
    await actions["tasks.update"]!({
      apiKey: "tok",
      taskId: "t-1",
      title: "Shipped",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(task);
      },
    });
    await actions["tasks.delete"]!({
      apiKey: "tok",
      taskId: "t-1",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response({ data: [] });
      },
    });
    expect(seen[0].method).toBe("PUT");
    expect(new URL(seen[0].url).pathname).toBe("/api/v4/tasks/t-1");
    expect(seen[1].method).toBe("DELETE");
  });

  test("creates a folder and a task comment", async () => {
    const seen: Request[] = [];
    const folderOut = await actions["folders.create"]!({
      apiKey: "tok",
      folderId: "f-1",
      title: "New folder",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(folder);
      },
    });
    const commentOut = await actions["comments.create"]!({
      apiKey: "tok",
      taskId: "t-1",
      text: "Ship it",
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return response(comments);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/api/v4/folders/f-1/folders");
    expect(new URL(seen[1].url).searchParams.get("text")).toBe("Ship it");
    expect(folderOut.folders).toEqual(folder.data);
    expect(commentOut.comments).toEqual(comments.data);
  });

  test("does not compile EventOnly webhook operations as HTTP actions", () => {
    expect(actions["webhook.task_created"]).toBeUndefined();
    expect(manifest.operations["webhook.task_created"].kind).toBe("webhook");
    expect(manifest.operations["webhook.comment_added"].request).toBeUndefined();
    expect(Object.keys(actions).sort()).toEqual([
      "attachments.list",
      "comments.create",
      "comments.delete",
      "comments.list",
      "comments.update",
      "contacts.get",
      "contacts.list",
      "folders.create",
      "folders.get",
      "folders.list",
      "folders.update",
      "healthcheck",
      "tasks.create",
      "tasks.delete",
      "tasks.get",
      "tasks.list",
      "tasks.update",
      "workflows.list",
    ]);
  });
});
