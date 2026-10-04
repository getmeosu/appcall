import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import sectionFixture from "../fixtures/section.json";
import labelFixture from "../fixtures/label.json";
import commentFixture from "../fixtures/comment.json";
import completedTasksFixture from "../fixtures/completed_tasks.json";
import collaboratorsFixture from "../fixtures/collaborators.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mock(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchFn };
}

function sentBody(call: Call): unknown {
  return JSON.parse(String(call.init?.body));
}

describe("todoist depth slice", () => {
  it("bumps the connector to a minor version for the new surface", () => {
    expect(manifest.version).toBe("0.2.0");
  });

  it("projects.delete archives permanently via DELETE", async () => {
    const { calls, fetchFn } = mock(null, 204);
    const result = await actions["projects.delete"]!({
      apiKey: "tok",
      projectId: "6XGgm6PHrGgMpCFX",
      fetch: fetchFn,
    });
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/projects/6XGgm6PHrGgMpCFX");
    expect(result).toMatchObject({ deleted: true, projectId: "6XGgm6PHrGgMpCFX" });
  });

  it("projects.archive and projects.unarchive post to their subpaths", async () => {
    const { calls, fetchFn } = mock(null, 204);
    await actions["projects.archive"]!({ apiKey: "tok", projectId: "6XGgm6PHrGgMpCFX", fetch: fetchFn });
    await actions["projects.unarchive"]!({ apiKey: "tok", projectId: "6XGgm6PHrGgMpCFX", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/projects/6XGgm6PHrGgMpCFX/archive");
    expect(calls[1]!.url).toBe("https://api.todoist.com/api/v1/projects/6XGgm6PHrGgMpCFX/unarchive");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it("sections.update posts the new name and sections.delete echoes the id", async () => {
    const { calls, fetchFn } = mock(sectionFixture);
    const updated = await actions["sections.update"]!({
      apiKey: "tok",
      sectionId: "6fFPHV272WWh3gpW",
      name: "In review",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/sections/6fFPHV272WWh3gpW");
    expect(sentBody(calls[0]!)).toEqual({ name: "In review" });
    expect(updated.section).toEqual(sectionFixture);

    const { calls: deleteCalls, fetchFn: deleteFetch } = mock(null, 204);
    const deleted = await actions["sections.delete"]!({
      apiKey: "tok",
      sectionId: "6fFPHV272WWh3gpW",
      fetch: deleteFetch,
    });
    expect(deleteCalls[0]!.init?.method).toBe("DELETE");
    expect(deleted).toMatchObject({ deleted: true, sectionId: "6fFPHV272WWh3gpW" });
  });

  it("labels.get / update / delete round-trip a personal label", async () => {
    const { calls, fetchFn } = mock(labelFixture);
    const got = await actions["labels.get"]!({
      apiKey: "tok",
      labelId: "2147509004",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/labels/2147509004");
    expect(got.label).toEqual(labelFixture);

    const { calls: updateCalls, fetchFn: updateFetch } = mock(labelFixture);
    await actions["labels.update"]!({
      apiKey: "tok",
      labelId: "2147509004",
      name: "urgent",
      isFavorite: true,
      fetch: updateFetch,
    });
    expect(updateCalls[0]!.init?.method).toBe("POST");
    expect(sentBody(updateCalls[0]!)).toEqual({ name: "urgent", is_favorite: true });

    const { fetchFn: deleteFetch } = mock(null, 204);
    const deleted = await actions["labels.delete"]!({
      apiKey: "tok",
      labelId: "2147509004",
      fetch: deleteFetch,
    });
    expect(deleted).toMatchObject({ deleted: true, labelId: "2147509004" });
  });

  it("comments.get / update / delete round-trip a comment", async () => {
    const { calls, fetchFn } = mock(commentFixture);
    const got = await actions["comments.get"]!({
      apiKey: "tok",
      commentId: "6XGgmFQrx44wfGHr",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/comments/6XGgmFQrx44wfGHr");
    expect(got.comment).toEqual(commentFixture);

    const { calls: updateCalls, fetchFn: updateFetch } = mock(commentFixture);
    await actions["comments.update"]!({
      apiKey: "tok",
      commentId: "6XGgmFQrx44wfGHr",
      content: "Shipped.",
      fetch: updateFetch,
    });
    expect(sentBody(updateCalls[0]!)).toEqual({ content: "Shipped." });

    const { fetchFn: deleteFetch } = mock(null, 204);
    const deleted = await actions["comments.delete"]!({
      apiKey: "tok",
      commentId: "6XGgmFQrx44wfGHr",
      fetch: deleteFetch,
    });
    expect(deleted).toMatchObject({ deleted: true, commentId: "6XGgmFQrx44wfGHr" });
  });

  it("tasks.listCompleted reads completed tasks with optional project and since", async () => {
    const { calls, fetchFn } = mock(completedTasksFixture);
    const result = await actions["tasks.listCompleted"]!({
      apiKey: "tok",
      projectId: "6XGgm6PHrGgMpCFX",
      since: "2025-01-01T00:00:00Z",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/tasks/completed");
    expect(url.searchParams.get("project_id")).toBe("6XGgm6PHrGgMpCFX");
    expect(url.searchParams.get("since")).toBe("2025-01-01T00:00:00Z");
    expect(result.tasks).toEqual(completedTasksFixture.results);
    expect(result.nextCursor).toBe(completedTasksFixture.next_cursor);
  });

  it("collaborators.list reads project members", async () => {
    const { calls, fetchFn } = mock(collaboratorsFixture);
    const result = await actions["collaborators.list"]!({
      apiKey: "tok",
      projectId: "6XGgm6PHrGgMpCFX",
      fetch: fetchFn,
    }) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.todoist.com/api/v1/projects/6XGgm6PHrGgMpCFX/collaborators");
    expect(result.collaborators).toEqual(collaboratorsFixture.results);
    expect("nextCursor" in result).toBe(false);
  });

  it("does not compile a handler for the EventOnly webhook", () => {
    expect(actions["webhook.item_completed"]).toBeUndefined();
  });
});
