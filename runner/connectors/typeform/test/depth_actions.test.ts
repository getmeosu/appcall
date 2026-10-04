import { describe, expect, it } from "bun:test";
import {
  getUserMe,
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  listThemes,
  getTheme,
  listImages,
  getWebhook,
  deleteWebhook,
  getFormMessages,
  patchForm,
} from "../src/actions";
import usersMeFixture from "../fixtures/users_me.json";
import workspacesListFixture from "../fixtures/workspaces_list.json";
import workspaceGetFixture from "../fixtures/workspace_get.json";
import themesListFixture from "../fixtures/themes_list.json";
import themeGetFixture from "../fixtures/theme_get.json";
import imagesListFixture from "../fixtures/images_list.json";
import webhookGetFixture from "../fixtures/webhook_get.json";
import formMessagesFixture from "../fixtures/form_messages.json";

const TOKEN = "fixture-api-token";

function capturingFetch(status: number, body: unknown, capture: { url?: string; method?: string; auth?: string; payload?: unknown }) {
  return (url: string, init?: RequestInit) => {
    capture.url = url;
    capture.method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    capture.auth = headers.Authorization ?? headers.authorization;
    try {
      capture.payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      capture.payload = init?.body;
    }
    return Promise.resolve(new Response(body == null ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }));
  };
}

describe("typeform users.me", () => {
  it("validates without accessToken", () => {
    const result = getUserMe({});
    expect(result).toMatchObject({ action: "users.me" });
  });

  it("gets the authenticated user", async () => {
    const capture: { url?: string; auth?: string } = {};
    const result = await getUserMe({
      accessToken: TOKEN,
      fetch: capturingFetch(200, usersMeFixture, capture),
    });
    expect(capture.url).toBe("https://api.typeform.com/me");
    expect(capture.auth).toBe(`Bearer ${TOKEN}`);
    expect(result).toMatchObject({ action: "users.me", user: { email: "operator@example.com", alias: "fixture-operator" } });
  });
});

describe("typeform workspaces", () => {
  it("lists workspaces", async () => {
    const capture: { url?: string } = {};
    const result = await listWorkspaces({
      accessToken: TOKEN,
      page: 1,
      fetch: capturingFetch(200, workspacesListFixture, capture),
    });
    expect(capture.url).toBe("https://api.typeform.com/workspaces?page=1");
    expect(result.action).toBe("workspaces.list");
    expect((result as Record<string, unknown>).totalItems).toBe(1);
  });

  it("gets a workspace", async () => {
    const result = await getWorkspace({
      accessToken: TOKEN,
      workspaceId: "ws_fixture_1",
      fetch: capturingFetch(200, workspaceGetFixture, {}),
    });
    expect(result).toMatchObject({ action: "workspaces.get", workspace: { name: "My Workspace", providerWorkspaceId: "ws_fixture_1" } });
  });

  it("creates a workspace", async () => {
    const capture: { method?: string; payload?: unknown; url?: string } = {};
    const result = await createWorkspace({
      accessToken: TOKEN,
      name: "Research",
      fetch: capturingFetch(201, { ...workspaceGetFixture, name: "Research" }, capture),
    });
    expect(capture.method).toBe("POST");
    expect(capture.url).toBe("https://api.typeform.com/workspaces");
    expect(capture.payload).toEqual({ name: "Research" });
    expect(result.action).toBe("workspaces.create");
  });

  it("updates a workspace", async () => {
    const capture: { method?: string; payload?: unknown; url?: string } = {};
    const result = await updateWorkspace({
      accessToken: TOKEN,
      workspaceId: "ws_fixture_1",
      name: "Renamed",
      fetch: capturingFetch(200, { ...workspaceGetFixture, name: "Renamed" }, capture),
    });
    expect(capture.method).toBe("PATCH");
    expect(capture.url).toBe("https://api.typeform.com/workspaces/ws_fixture_1");
    expect(result).toMatchObject({ action: "workspaces.update" });
  });

  it("requires workspaceId", () => {
    expect(() => getWorkspace({})).toThrow("workspaceId is required");
  });
});

describe("typeform themes and images", () => {
  it("lists themes", async () => {
    const result = await listThemes({
      accessToken: TOKEN,
      fetch: capturingFetch(200, themesListFixture, {}),
    });
    expect(result.action).toBe("themes.list");
    expect(Array.isArray((result as Record<string, unknown>).themes)).toBe(true);
  });

  it("gets a theme", async () => {
    const result = await getTheme({
      accessToken: TOKEN,
      themeId: "theme_fixture_1",
      fetch: capturingFetch(200, themeGetFixture, {}),
    });
    expect(result).toMatchObject({ action: "themes.get", theme: { name: "Default" } });
  });

  it("lists images", async () => {
    const result = await listImages({
      accessToken: TOKEN,
      fetch: capturingFetch(200, imagesListFixture, {}),
    });
    expect(result.action).toBe("images.list");
    expect((result as { images: unknown[] }).images[0]).toMatchObject({ fileName: "header.png" });
  });
});

describe("typeform webhooks get/delete", () => {
  it("gets a webhook", async () => {
    const capture: { url?: string } = {};
    const result = await getWebhook({
      accessToken: TOKEN,
      formId: "abc123",
      tag: "my-webhook",
      fetch: capturingFetch(200, webhookGetFixture, capture),
    });
    expect(capture.url).toBe("https://api.typeform.com/forms/abc123/webhooks/my-webhook");
    expect(result).toMatchObject({ action: "webhooks.get", webhook: { tag: "my-webhook" } });
  });

  it("deletes a webhook", async () => {
    const capture: { method?: string; url?: string } = {};
    const result = await deleteWebhook({
      accessToken: TOKEN,
      formId: "abc123",
      tag: "my-webhook",
      fetch: capturingFetch(204, null, capture),
    });
    expect(capture.method).toBe("DELETE");
    expect(result).toMatchObject({ action: "webhooks.delete", deleted: true });
  });

  it("maps 429", async () => {
    await expect(getWebhook({
      accessToken: TOKEN,
      formId: "abc123",
      tag: "my-webhook",
      fetch: () => Promise.resolve(new Response("{}", { status: 429, headers: { "Retry-After": "12" } })),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

describe("typeform form messages and patch", () => {
  it("gets form messages", async () => {
    const result = await getFormMessages({
      accessToken: TOKEN,
      formId: "abc123",
      fetch: capturingFetch(200, formMessagesFixture, {}),
    });
    expect(result).toMatchObject({ action: "forms.messages.get", formId: "abc123" });
  });

  it("patches a form", async () => {
    const capture: { method?: string; payload?: unknown; url?: string } = {};
    const operations = [{ op: "replace", path: "/title", value: "Updated" }];
    const result = await patchForm({
      accessToken: TOKEN,
      formId: "abc123",
      operations,
      fetch: capturingFetch(204, null, capture),
    });
    expect(capture.method).toBe("PATCH");
    expect(capture.url).toBe("https://api.typeform.com/forms/abc123");
    expect(capture.payload).toEqual(operations);
    expect(result).toMatchObject({ action: "forms.patch", patched: true });
  });

  it("requires operations", () => {
    expect(() => patchForm({ formId: "abc123" })).toThrow("operations is required");
  });
});
