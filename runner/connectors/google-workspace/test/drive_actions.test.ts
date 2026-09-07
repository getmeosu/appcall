import { describe, expect, test } from "bun:test";
import driveFileFixture from "../fixtures/drive_file.json";
import drivePermissionFixture from "../fixtures/drive_permission.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import {
  createDriveActionsClient,
  validateGetFileInput,
  validateCreateDriveFileInput,
  validateDeleteFileInput,
  validateCreatePermissionInput,
} from "../src/files";

describe("google-workspace Drive actions", () => {
  // ─── drive.files.get ────────────────────────────────────────────────────

  test("validateGetFileInput accepts valid input", () => {
    const r = validateGetFileInput({ fileId: "abc123" });
    expect(r.fileId).toBe("abc123");
  });

  test("validateGetFileInput accepts optional fields param", () => {
    const r = validateGetFileInput({ fileId: "abc", fields: "id,name" });
    expect(r.fields).toBe("id,name");
  });

  test("validateGetFileInput throws on missing fileId", () => {
    expect(() => validateGetFileInput({})).toThrow();
    expect(() => validateGetFileInput("not-object")).toThrow();
  });

  test("getFile fetches correct URL with Authorization header", async () => {
    const requests: Request[] = [];
    const client = createDriveActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(driveFileFixture);
      },
    });

    const result = await client.getFile({ fileId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://www.googleapis.com/drive/v3/files/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.id).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
      expect(result.file.name).toBe("My Document");
      expect(result.file.mimeType).toBe("application/vnd.google-apps.document");
    }
  });

  test("getFile maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createDriveActionsClient({
      accessToken: "token",
      fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });

    const result = await client.getFile({ fileId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(30);
    }
  });

  // ─── drive.files.create ─────────────────────────────────────────────────

  test("validateCreateDriveFileInput accepts valid input", () => {
    const r = validateCreateDriveFileInput({
      name: "My Folder",
      mimeType: "application/vnd.google-apps.folder",
    });
    expect(r.name).toBe("My Folder");
    expect(r.mimeType).toBe("application/vnd.google-apps.folder");
  });

  test("validateCreateDriveFileInput accepts optional parents and description", () => {
    const r = validateCreateDriveFileInput({
      name: "Doc",
      mimeType: "application/vnd.google-apps.document",
      parents: ["parentId123"],
      description: "My doc",
    });
    expect(r.parents).toEqual(["parentId123"]);
    expect(r.description).toBe("My doc");
  });

  test("validateCreateDriveFileInput throws on missing name", () => {
    expect(() => validateCreateDriveFileInput({ mimeType: "text/plain" })).toThrow();
  });

  test("createFile posts to Drive API with metadata", async () => {
    const requests: Request[] = [];
    const client = createDriveActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(driveFileFixture);
      },
    });

    const result = await client.createFile({
      name: "My Document",
      mimeType: "application/vnd.google-apps.document",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://www.googleapis.com/drive/v3/files");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.id).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
    }
  });

  test("createFile maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createDriveActionsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 400, message: "Bad Request", status: 400 } }),
        { status: 400 },
      ),
    });

    const result = await client.createFile({ name: "Test", mimeType: "text/plain" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── drive.files.delete ─────────────────────────────────────────────────

  test("validateDeleteFileInput accepts valid input", () => {
    const r = validateDeleteFileInput({ fileId: "abc123" });
    expect(r.fileId).toBe("abc123");
  });

  test("validateDeleteFileInput throws on missing fileId", () => {
    expect(() => validateDeleteFileInput({})).toThrow();
  });

  test("deleteFile sends DELETE to correct URL and returns deleted:true on 204", async () => {
    const requests: Request[] = [];
    const client = createDriveActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });

    const result = await client.deleteFile({ fileId: "file123" });

    expect(requests[0].url).toBe("https://www.googleapis.com/drive/v3/files/file123");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deleted).toBe(true);
      expect(result.fileId).toBe("file123");
    }
  });

  test("deleteFile maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createDriveActionsClient({
      accessToken: "token",
      fetch: async () => new Response("", {
        status: 429,
        headers: { "Retry-After": "20" },
      }),
    });

    const result = await client.deleteFile({ fileId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── drive.permissions.create ───────────────────────────────────────────

  test("validateCreatePermissionInput accepts valid input", () => {
    const r = validateCreatePermissionInput({
      fileId: "fileId123",
      role: "reader",
      type: "user",
      emailAddress: "collab@example.com",
    });
    expect(r.fileId).toBe("fileId123");
    expect(r.role).toBe("reader");
    expect(r.type).toBe("user");
    expect(r.emailAddress).toBe("collab@example.com");
  });

  test("validateCreatePermissionInput throws on missing required fields", () => {
    expect(() => validateCreatePermissionInput({ fileId: "abc", role: "reader" })).toThrow();
    expect(() => validateCreatePermissionInput({ fileId: "abc" })).toThrow();
  });

  test("createPermission posts to correct URL", async () => {
    const requests: Request[] = [];
    const client = createDriveActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(drivePermissionFixture);
      },
    });

    const result = await client.createPermission({
      fileId: "fileId123",
      role: "reader",
      type: "user",
      emailAddress: "collaborator@example.com",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://www.googleapis.com/drive/v3/files/fileId123/permissions");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.permission.permissionId).toBe("perm123");
      expect(result.permission.role).toBe("reader");
      expect(result.permission.emailAddress).toBe("collaborator@example.com");
    }
  });

  test("createPermission maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createDriveActionsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 403, message: "Forbidden", status: 403 } }),
        { status: 403 },
      ),
    });

    const result = await client.createPermission({ fileId: "abc", role: "reader", type: "user" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
