import { describe, expect, test } from "bun:test";
import {
  getUserMe,
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  createAccountWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listThemes,
  getTheme,
  createTheme,
  updateTheme,
  patchTheme,
  deleteTheme,
  listImages,
  createImage,
  deleteImage,
  getImageBySize,
  getBackgroundBySize,
  getChoiceImageBySize,
  getWebhook,
  deleteWebhook,
  getFormMessages,
  updateFormMessages,
  patchForm,
  getResponseFiles,
  uploadVideo,
} from "../src/actions";
import usersMeFixture from "../fixtures/users_me.json";
import workspacesListFixture from "../fixtures/workspaces_list.json";
import workspaceGetFixture from "../fixtures/workspace_get.json";
import themesListFixture from "../fixtures/themes_list.json";
import themeGetFixture from "../fixtures/theme_get.json";
import imagesListFixture from "../fixtures/images_list.json";
import imageGetFixture from "../fixtures/image_get.json";
import webhookGetFixture from "../fixtures/webhook_get.json";
import formMessagesFixture from "../fixtures/form_messages.json";
import videoUploadFixture from "../fixtures/video_upload.json";

const TOKEN = "tf-token-abc";

async function call(
  action: (input: unknown) => unknown,
  input: Record<string, unknown>,
  status: number,
  body: unknown,
  capture: { requests: Request[] },
) {
  return action({
    ...input,
    accessToken: TOKEN,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      const req = new Request(url, init);
      capture.requests.push(req);
      if (body === null || body === undefined) {
        return new Response("", { status });
      }
      if (typeof body === "string") {
        return new Response(body, { status, headers: { "content-type": "application/zip" } });
      }
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    },
  });
}

const themePayload = {
  name: "Brand",
  font: "Arial",
  colors: { question: "#000000", answer: "#111111", button: "#222222", background: "#FFFFFF" },
  fields: { alignment: "left", font_size: "medium" },
};

describe("typeform users.me", () => {
  test("validates without accessToken", () => {
    expect(getUserMe({})).toMatchObject({ action: "users.me", source: "connector" });
  });

  test("GET /me", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(getUserMe, {}, 200, usersMeFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].url).toBe("https://api.typeform.com/me");
    expect(capture.requests[0].method).toBe("GET");
    expect(capture.requests[0].headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(result).toMatchObject({ action: "users.me", user: { email: "operator@example.com", alias: "fixture-operator" } });
  });
});

describe("typeform workspaces", () => {
  test("lists workspaces with pagination and search", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(listWorkspaces, { page: 1, page_size: 20, search: "My" }, 200, workspacesListFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].url).toContain("https://api.typeform.com/workspaces?");
    expect(capture.requests[0].url).toContain("page=1");
    expect(capture.requests[0].url).toContain("page_size=20");
    expect(capture.requests[0].url).toContain("search=My");
    expect(result.action).toBe("workspaces.list");
    expect(result.totalItems).toBe(1);
  });

  test("gets a workspace by snake_case id", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(getWorkspace, { workspace_id: "ws_fixture_1" }, 200, workspaceGetFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].url).toBe("https://api.typeform.com/workspaces/ws_fixture_1");
    expect(result).toMatchObject({ action: "workspaces.get", workspace: { name: "My Workspace", providerWorkspaceId: "ws_fixture_1" } });
  });

  test("creates a workspace", async () => {
    const capture = { requests: [] as Request[] };
    await call(createWorkspace, { name: "Research" }, 201, { ...workspaceGetFixture, name: "Research" }, capture);
    expect(capture.requests[0].method).toBe("POST");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/workspaces");
    expect(await capture.requests[0].json()).toEqual({ name: "Research" });
  });

  test("creates an account workspace", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(createAccountWorkspace, { account_id: "acct_fixture", name: "Team A" }, 201, workspaceGetFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("POST");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/accounts/acct_fixture/workspaces");
    expect(await capture.requests[0].json()).toEqual({ name: "Team A" });
    expect(result.action).toBe("workspaces.create_in_account");
  });

  test("updates a workspace with JSON Patch operations", async () => {
    const capture = { requests: [] as Request[] };
    const operations = [{ op: "replace", path: "/name", value: "Renamed" }];
    const result = await call(updateWorkspace, { workspaceId: "ws_fixture_1", operations }, 204, null, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("PATCH");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/workspaces/ws_fixture_1");
    expect(await capture.requests[0].json()).toEqual(operations);
    expect(result).toMatchObject({ action: "workspaces.update", updated: true });
  });

  test("updates a workspace name as a replace patch", async () => {
    const capture = { requests: [] as Request[] };
    await call(updateWorkspace, { workspace_id: "ws_fixture_1", name: "Renamed" }, 204, null, capture);
    expect(await capture.requests[0].json()).toEqual([{ op: "replace", path: "/name", value: "Renamed" }]);
  });

  test("deletes a workspace", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(deleteWorkspace, { workspaceId: "ws_fixture_1" }, 204, null, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("DELETE");
    expect(result).toMatchObject({ action: "workspaces.delete", deleted: true, workspaceId: "ws_fixture_1" });
  });

  test("requires workspaceId", () => {
    expect(() => getWorkspace({})).toThrow("workspaceId is required");
  });
});

describe("typeform themes", () => {
  test("lists themes", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(listThemes, { page: 2, pageSize: 10 }, 200, themesListFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].url).toBe("https://api.typeform.com/themes?page=2&page_size=10");
    expect(result.action).toBe("themes.list");
    expect(Array.isArray(result.themes)).toBe(true);
  });

  test("gets a theme", async () => {
    const result = await call(getTheme, { theme_id: "theme_fixture_1" }, 200, themeGetFixture, { requests: [] }) as Record<string, unknown>;
    expect(result).toMatchObject({ action: "themes.get", theme: { name: "Default" } });
  });

  test("creates a theme", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(createTheme, themePayload, 201, themeGetFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("POST");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/themes");
    const body = await capture.requests[0].json() as Record<string, unknown>;
    expect(body.font).toBe("Arial");
    expect(body.colors).toEqual(themePayload.colors);
    expect(result.action).toBe("themes.create");
  });

  test("requires theme colors on create", () => {
    expect(() => createTheme({ name: "X", font: "Arial" })).toThrow("colors is required");
  });

  test("updates a theme with PUT", async () => {
    const capture = { requests: [] as Request[] };
    await call(updateTheme, { themeId: "theme_fixture_1", ...themePayload }, 200, themeGetFixture, capture);
    expect(capture.requests[0].method).toBe("PUT");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/themes/theme_fixture_1");
  });

  test("patches a theme", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(patchTheme, { theme_id: "theme_fixture_1", name: "Renamed" }, 200, themeGetFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("PATCH");
    expect(await capture.requests[0].json()).toEqual({ name: "Renamed" });
    expect(result.action).toBe("themes.patch");
  });

  test("deletes a theme", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(deleteTheme, { themeId: "theme_fixture_1" }, 204, null, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("DELETE");
    expect(result).toMatchObject({ action: "themes.delete", deleted: true });
  });
});

describe("typeform images", () => {
  test("lists images", async () => {
    const result = await call(listImages, {}, 200, imagesListFixture, { requests: [] }) as Record<string, unknown>;
    expect(result.action).toBe("images.list");
    expect((result.images as Record<string, unknown>[])[0]).toMatchObject({ fileName: "header.png" });
  });

  test("creates an image from url", async () => {
    const capture = { requests: [] as Request[] };
    await call(createImage, { file_name: "logo.png", url: "https://cdn.example.com/logo.png" }, 201, imageGetFixture, capture);
    expect(capture.requests[0].method).toBe("POST");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/images");
    expect(await capture.requests[0].json()).toEqual({ file_name: "logo.png", url: "https://cdn.example.com/logo.png" });
  });

  test("requires image or url on create", () => {
    expect(() => createImage({ file_name: "x.png" })).toThrow("image or url is required");
  });

  test("deletes an image", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(deleteImage, { image_id: "img_fixture_1" }, 204, null, capture) as Record<string, unknown>;
    expect(capture.requests[0].url).toBe("https://api.typeform.com/images/img_fixture_1");
    expect(capture.requests[0].method).toBe("DELETE");
    expect(result).toMatchObject({ action: "images.delete", deleted: true });
  });

  test("gets an image by size as JSON", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(getImageBySize, { image_id: "img_fixture_1", size: "thumbnail" }, 200, imageGetFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].url).toBe("https://api.typeform.com/images/img_fixture_1/image/thumbnail");
    expect(capture.requests[0].headers.get("Accept")).toBe("application/json");
    expect(result.action).toBe("images.get");
  });

  test("gets a background by size", async () => {
    const capture = { requests: [] as Request[] };
    await call(getBackgroundBySize, { imageId: "img_fixture_1", size: "tablet" }, 200, imageGetFixture, capture);
    expect(capture.requests[0].url).toBe("https://api.typeform.com/images/img_fixture_1/background/tablet");
  });

  test("gets a choice image by size", async () => {
    const capture = { requests: [] as Request[] };
    await call(getChoiceImageBySize, { image_id: "img_fixture_1", size: "supersize" }, 200, imageGetFixture, capture);
    expect(capture.requests[0].url).toBe("https://api.typeform.com/images/img_fixture_1/choice/supersize");
  });

  test("rejects an invalid image size", () => {
    expect(() => getImageBySize({ image_id: "img_fixture_1", size: "huge" })).toThrow("size is invalid");
  });
});

describe("typeform webhooks get/delete", () => {
  test("gets a webhook", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(getWebhook, { form_id: "abc123", tag: "my-webhook" }, 200, webhookGetFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].url).toBe("https://api.typeform.com/forms/abc123/webhooks/my-webhook");
    expect(result).toMatchObject({ action: "webhooks.get", webhook: { tag: "my-webhook" } });
  });

  test("deletes a webhook", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(deleteWebhook, { formId: "abc123", tag: "my-webhook" }, 204, null, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("DELETE");
    expect(result).toMatchObject({ action: "webhooks.delete", deleted: true });
  });

  test("maps 429", async () => {
    await expect(getWebhook({
      accessToken: TOKEN,
      formId: "abc123",
      tag: "my-webhook",
      fetch: () => Promise.resolve(new Response("{}", { status: 429, headers: { "Retry-After": "12" } })),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

describe("typeform form messages and patch", () => {
  test("gets form messages", async () => {
    const result = await call(getFormMessages, { formId: "abc123" }, 200, formMessagesFixture, { requests: [] }) as Record<string, unknown>;
    expect(result).toMatchObject({ action: "forms.messages.get", formId: "abc123" });
  });

  test("updates form messages and maps Composio keys", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(updateFormMessages, {
      form_id: "abc123",
      label_button_submit: "Send",
      label_error_required: "Required",
    }, 204, null, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("PUT");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/forms/abc123/messages");
    expect(await capture.requests[0].json()).toEqual({
      "label.button.submit": "Send",
      "label.error.required": "Required",
    });
    expect(result).toMatchObject({ action: "forms.messages.update", updated: true });
  });

  test("patches a form", async () => {
    const capture = { requests: [] as Request[] };
    const operations = [{ op: "replace", path: "/title", value: "Updated" }];
    const result = await call(patchForm, { formId: "abc123", operations }, 204, null, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("PATCH");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/forms/abc123");
    expect(await capture.requests[0].json()).toEqual(operations);
    expect(result).toMatchObject({ action: "forms.patch", patched: true });
  });

  test("requires operations", () => {
    expect(() => patchForm({ formId: "abc123" })).toThrow("operations is required");
  });
});

describe("typeform response files and video upload", () => {
  test("downloads all response files", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(getResponseFiles, { form_id: "abc123" }, 200, "PK\u0003\u0004zip", capture) as Record<string, unknown>;
    expect(capture.requests[0].url).toBe("https://api.typeform.com/forms/abc123/responses/files");
    expect(result.action).toBe("responses.files.get");
    expect(result.empty).toBe(false);
    expect(typeof result.body).toBe("string");
  });

  test("treats 204 as no uploaded files", async () => {
    const result = await call(getResponseFiles, { formId: "abc123" }, 204, null, { requests: [] }) as Record<string, unknown>;
    expect(result).toMatchObject({ action: "responses.files.get", empty: true, formId: "abc123" });
  });

  test("initiates a video upload", async () => {
    const capture = { requests: [] as Request[] };
    const result = await call(uploadVideo, { form_id: "abc123", field_id: "field_1", language: "en" }, 201, videoUploadFixture, capture) as Record<string, unknown>;
    expect(capture.requests[0].method).toBe("POST");
    expect(capture.requests[0].url).toBe("https://api.typeform.com/media/videos");
    expect(await capture.requests[0].json()).toEqual({ form_id: "abc123", field_id: "field_1", language: "en" });
    expect(result).toMatchObject({
      action: "videos.upload",
      video: { id: "video_abc123def456", uploadUrl: videoUploadFixture.upload_url },
    });
  });

  test("requires language for video upload", () => {
    expect(() => uploadVideo({ form_id: "abc123", field_id: "field_1" })).toThrow("language is required");
  });
});
