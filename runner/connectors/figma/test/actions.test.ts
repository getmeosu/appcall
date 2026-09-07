import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import meFixture from "../fixtures/me.json";
import fileFixture from "../fixtures/file.json";
import fileNodesFixture from "../fixtures/file_nodes.json";
import fileMetaFixture from "../fixtures/file_meta.json";
import versionsFixture from "../fixtures/versions.json";
import versionsLastPageFixture from "../fixtures/versions_last_page.json";
import imagesFixture from "../fixtures/images.json";
import imageFillsFixture from "../fixtures/image_fills.json";
import commentsFixture from "../fixtures/comments.json";
import commentFixture from "../fixtures/comment.json";
import commentDeletedFixture from "../fixtures/comment_deleted.json";
import foldersFixture from "../fixtures/folders.json";
import folderFilesFixture from "../fixtures/folder_files.json";
import errorInvalidTokenFixture from "../fixtures/error_invalid_token.json";
import errorForbiddenFixture from "../fixtures/error_forbidden.json";
import errorBadRequestFixture from "../fixtures/error_bad_request.json";
import errorBadRequestFolderFixture from "../fixtures/error_bad_request_folder.json";
import errorRateLimitedFixture from "../fixtures/error_rate_limited.json";

const { actions } = compileDeclarativeConnector(manifest as never);

type Call = { url: string; init?: RequestInit };

function mock(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

function tokenHeader(calls: Call[]): string {
  return (calls[0]!.init?.headers as Record<string, string>)["X-Figma-Token"] ?? "";
}

function sentBody(call: Call): unknown {
  return JSON.parse(String(call.init?.body));
}

describe("figma connector surface", () => {
  it("compiles one handler per declared operation", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("authentication", () => {
  it("sends the personal access token as X-Figma-Token, not an Authorization header", async () => {
    const { calls, fetchFn } = mock(meFixture);
    await actions.healthcheck!({ accessToken: "figd_abc123", fetch: fetchFn });
    expect(tokenHeader(calls)).toBe("figd_abc123");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("declares the credential under the field the setup form collects", () => {
    const secretFields = manifest.auth.setup.fields.filter((field) => field.secret);
    expect(secretFields.map((field) => field.key)).toEqual(["accessToken"]);
    expect(manifest.http.auth.field).toBe("accessToken");
  });
});

describe("healthcheck", () => {
  it("does not issue a live call when no token is supplied — the fixture-safe validated echo instead", () => {
    expect(actions.healthcheck!({})).toEqual({
      connector: "figma",
      action: "healthcheck",
      source: "connector",
      status: "ok",
    });
  });

  it("calls GET /v1/me and reports the authenticated user", async () => {
    const { calls, fetchFn } = mock(meFixture);
    const result = (await actions.healthcheck!({ accessToken: "tok", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/me");
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
    expect(result).toEqual({
      connector: "figma",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      userId: "123456789012345678",
      handle: "Figma User",
      imgUrl: "https://s3-alpha.figma.com/profile/abc123def456.png",
      email: "user@example.com",
    });
  });

  it("surfaces a 401 using the {status, err} envelope, live-confirmed on /v1/me even though the spec omits 401 here", async () => {
    const { fetchFn } = mock(errorInvalidTokenFixture, 401);
    await expect(actions.healthcheck!({ accessToken: "bad", fetch: fetchFn })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Invalid token",
    });
  });

  it("treats 403 as an authentication failure too, reading the same {status, err} envelope", async () => {
    const { fetchFn } = mock(errorForbiddenFixture, 403);
    await expect(actions.healthcheck!({ accessToken: "scoped", fetch: fetchFn })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Insufficient scope",
    });
  });

  it("rejects a rate-limited response and reads the seconds to wait from retry-after", async () => {
    const { fetchFn } = mock(errorRateLimitedFixture, 429, { "retry-after": "45" });
    await expect(actions.healthcheck!({ accessToken: "tok", fetch: fetchFn })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 45,
    });
  });
});

describe("file.get", () => {
  it("requires fileKey", () => {
    expect(() => actions["file.get"]!({ accessToken: "tok" })).toThrow("fileKey is required");
  });

  it("fetches the document tree, passing ids and depth to limit the response", async () => {
    const { calls, fetchFn } = mock(fileFixture);
    const result = (await actions["file.get"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      ids: "0:1",
      depth: 1,
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/files/abcXYZ123");
    expect(url.searchParams.get("ids")).toBe("0:1");
    expect(url.searchParams.get("depth")).toBe("1");
    const file = result.file as Record<string, unknown>;
    expect(file.key).toBe("abcXYZ123");
    expect(file.name).toBe("Design System");
    expect(file.document).toEqual(fileFixture.document);
  });

  it("omits query params the caller left out", async () => {
    const { calls, fetchFn } = mock(fileFixture);
    await actions["file.get"]!({ accessToken: "tok", fileKey: "abcXYZ123", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.has("ids")).toBe(false);
    expect(url.searchParams.has("depth")).toBe(false);
  });
});

describe("file.getNodes", () => {
  it("requires fileKey and ids — ids is useless to omit since the call returns nothing without it", () => {
    expect(() => actions["file.getNodes"]!({ accessToken: "tok", fileKey: "abcXYZ123" })).toThrow("ids is required");
    expect(() => actions["file.getNodes"]!({ accessToken: "tok", ids: "1:2" })).toThrow("fileKey is required");
  });

  it("fetches specific nodes by id", async () => {
    const { calls, fetchFn } = mock(fileNodesFixture);
    const result = (await actions["file.getNodes"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      ids: "1:2",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/files/abcXYZ123/nodes");
    expect(url.searchParams.get("ids")).toBe("1:2");
    expect(result.nodes).toEqual(fileNodesFixture.nodes);
  });
});

describe("file.getMeta", () => {
  it("requires fileKey", () => {
    expect(() => actions["file.getMeta"]!({ accessToken: "tok" })).toThrow("fileKey is required");
  });

  it("resolves the file's shareable URL, which file.get and file.getNodes do not return", async () => {
    const { calls, fetchFn } = mock(fileMetaFixture);
    const result = (await actions["file.getMeta"]!({ accessToken: "tok", fileKey: "abcXYZ123", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/meta");
    const file = result.file as Record<string, unknown>;
    expect(file.url).toBe("https://www.figma.com/file/abcXYZ123/Design-System");
  });
});

describe("file.listVersions — the only paginated Figma list", () => {
  it("requires fileKey", () => {
    expect(() => actions["file.listVersions"]!({ accessToken: "tok" })).toThrow("fileKey is required");
  });

  it("passes page_size/before/after and maps pagination.next_page to nextPage", async () => {
    const { calls, fetchFn } = mock(versionsFixture);
    const result = (await actions["file.listVersions"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      pageSize: 30,
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/files/abcXYZ123/versions");
    expect(url.searchParams.get("page_size")).toBe("30");
    expect(result.versions).toEqual(versionsFixture.versions);
    expect(result.nextPage).toBe(versionsFixture.pagination.next_page);
  });

  it("drops nextPage entirely on the last page, since next_page is null there", async () => {
    const { fetchFn } = mock(versionsLastPageFixture);
    const result = (await actions["file.listVersions"]!({ accessToken: "tok", fileKey: "abcXYZ123", fetch: fetchFn })) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(result, "nextPage")).toBe(false);
  });
});

describe("image.render", () => {
  it("requires fileKey and ids", () => {
    expect(() => actions["image.render"]!({ accessToken: "tok", fileKey: "abcXYZ123" })).toThrow("ids is required");
    expect(() => actions["image.render"]!({ accessToken: "tok", ids: "1:2" })).toThrow("fileKey is required");
  });

  it("renders nodes and returns CDN URLs keyed by node id, with a null for a failed render", async () => {
    const { calls, fetchFn } = mock(imagesFixture);
    const result = (await actions["image.render"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      ids: "1:2,1:3",
      format: "png",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/images/abcXYZ123");
    expect(url.searchParams.get("ids")).toBe("1:2,1:3");
    expect(url.searchParams.get("format")).toBe("png");
    expect(result.images).toEqual(imagesFixture.images);
  });

  it("does not treat the err: null success envelope as a failure, since no bodyErrorPaths is configured", async () => {
    // The fixture's top-level err: null could look like an error signal to a
    // naive check; assert the actual mapped images shape resolves correctly
    // rather than merely "the promise resolved to something".
    const { fetchFn } = mock(imagesFixture);
    const result = await actions["image.render"]!({ accessToken: "tok", fileKey: "abcXYZ123", ids: "1:2", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.images).toEqual(imagesFixture.images);
  });
});

describe("image.listFills", () => {
  it("requires fileKey", () => {
    expect(() => actions["image.listFills"]!({ accessToken: "tok" })).toThrow("fileKey is required");
  });

  it("returns fill URLs keyed by imageRef, reading through the different meta.images envelope", async () => {
    const { calls, fetchFn } = mock(imageFillsFixture);
    const result = (await actions["image.listFills"]!({ accessToken: "tok", fileKey: "abcXYZ123", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/images");
    expect(result.images).toEqual(imageFillsFixture.meta.images);
  });

  it("does not treat the error: false success envelope as a failure, since no bodyErrorPaths is configured", async () => {
    // The fixture's top-level error: false could look like an error signal
    // to a naive check; assert the actual mapped images shape resolves
    // correctly rather than merely "the promise resolved to something".
    const { fetchFn } = mock(imageFillsFixture);
    const result = await actions["image.listFills"]!({ accessToken: "tok", fileKey: "abcXYZ123", fetch: fetchFn }) as Record<string, unknown>;
    expect(result.images).toEqual(imageFillsFixture.meta.images);
  });
});

describe("comment.list", () => {
  it("requires fileKey", () => {
    expect(() => actions["comment.list"]!({ accessToken: "tok" })).toThrow("fileKey is required");
  });

  it("lists every comment in one call, with no cursor", async () => {
    const { calls, fetchFn } = mock(commentsFixture);
    const result = (await actions["comment.list"]!({ accessToken: "tok", fileKey: "abcXYZ123", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/comments");
    expect(result.comments).toEqual(commentsFixture.comments);
  });
});

describe("comment.create", () => {
  it("requires fileKey and message", () => {
    expect(() => actions["comment.create"]!({ accessToken: "tok", fileKey: "abcXYZ123" })).toThrow("message is required");
    expect(() => actions["comment.create"]!({ accessToken: "tok", message: "hi" })).toThrow("fileKey is required");
  });

  it("posts the message and omits comment_id when replying to nothing", async () => {
    const { calls, fetchFn } = mock(commentFixture, 200);
    const result = (await actions["comment.create"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      message: "Can we adjust the spacing here?",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/comments");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(sentBody(calls[0]!)).toEqual({ message: "Can we adjust the spacing here?" });
    expect(result.comment).toEqual(commentFixture);
  });

  it("includes comment_id when replying to a root comment", async () => {
    const { calls, fetchFn } = mock(commentFixture, 200);
    await actions["comment.create"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      message: "reply",
      commentId: "1234567890123456",
      fetch: fetchFn,
    });
    expect(sentBody(calls[0]!)).toEqual({ message: "reply", comment_id: "1234567890123456" });
  });

  it("surfaces the {error, status, message} envelope on a bad request — the second of Figma's two error shapes", async () => {
    const { fetchFn } = mock(errorBadRequestFixture, 400);
    await expect(
      actions["comment.create"]!({ accessToken: "tok", fileKey: "abcXYZ123", message: "test", fetch: fetchFn }),
    ).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "message is required",
    });
  });
});

describe("comment.delete", () => {
  it("requires fileKey and commentId", () => {
    expect(() => actions["comment.delete"]!({ accessToken: "tok", fileKey: "abcXYZ123" })).toThrow("commentId is required");
    expect(() => actions["comment.delete"]!({ accessToken: "tok", commentId: "1" })).toThrow("fileKey is required");
  });

  it("issues a DELETE and echoes back the deleted ids, since Figma answers with an empty body", async () => {
    const { calls, fetchFn } = mock(commentDeletedFixture, 200);
    const result = (await actions["comment.delete"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      commentId: "1234567890123456",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v1/files/abcXYZ123/comments/1234567890123456");
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(result).toMatchObject({ deleted: true, fileKey: "abcXYZ123", commentId: "1234567890123456" });
  });

  it("also accepts a 204 with no body as a successful delete (exact code unconfirmed pending a live capture)", async () => {
    const { fetchFn } = mock(null, 204);
    const result = (await actions["comment.delete"]!({
      accessToken: "tok",
      fileKey: "abcXYZ123",
      commentId: "1234567890123456",
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(result).toMatchObject({ deleted: true, fileKey: "abcXYZ123", commentId: "1234567890123456" });
  });
});

describe("folder.listForTeam", () => {
  it("requires teamId", () => {
    expect(() => actions["folder.listForTeam"]!({ accessToken: "tok" })).toThrow("teamId is required");
  });

  it("lists folders via the v2 surface, not the deprecated v1 projects endpoint", async () => {
    const { calls, fetchFn } = mock(foldersFixture);
    const result = (await actions["folder.listForTeam"]!({ accessToken: "tok", teamId: "999999", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v2/teams/999999/folders");
    expect(result.folders).toEqual(foldersFixture.folders);
  });
});

describe("folder.listFiles", () => {
  it("requires folderId", () => {
    expect(() => actions["folder.listFiles"]!({ accessToken: "tok" })).toThrow("folderId is required");
  });

  it("lists the files in a folder — each file's key is the file_key every other operation takes", async () => {
    const { calls, fetchFn } = mock(folderFilesFixture);
    const result = (await actions["folder.listFiles"]!({ accessToken: "tok", folderId: "111111", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://api.figma.com/v2/folders/111111/files");
    const files = result.files as Array<Record<string, unknown>>;
    expect(files[0]!.key).toBe("abcXYZ123");
  });

  it("surfaces the {error, status, message} envelope on a bad folder id, the second documented use of that shape", async () => {
    const { fetchFn } = mock(errorBadRequestFolderFixture, 400);
    await expect(
      actions["folder.listFiles"]!({ accessToken: "tok", folderId: "nope", fetch: fetchFn }),
    ).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Invalid folder id",
    });
  });
});
