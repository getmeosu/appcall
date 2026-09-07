import { describe, expect, test } from "bun:test";
import filesListFixture from "../fixtures/files_list.json";
import { normalizeDriveFile, parseFilesListResponse } from "../src/files";

describe("google-workspace files", () => {
  test("normalizes Drive file from fixture", () => {
    const file = normalizeDriveFile(filesListFixture.files[0]);

    expect(file.id).toBe("drive:1a2b3c4d5e6f");
    expect(file.provider).toBe("google-workspace");
    expect(file.providerFileId).toBe("1a2b3c4d5e6f");
    expect(file.name).toBe("Project Report.pdf");
    expect(file.mimeType).toBe("application/pdf");
    expect(file.parentId).toBe("0AbCdEfGhIjKlMnOpQrS");
    expect(file.size).toBe(524288);
    expect(file.webViewLink).toBe("https://drive.google.com/file/d/1a2b3c4d5e6f/view");
    expect(file.modelVersion).toBe("2026-05-16");
  });

  test("parses file size string to number", () => {
    const file = normalizeDriveFile(filesListFixture.files[0]);
    expect(typeof file.size).toBe("number");
    expect(file.size).toBeGreaterThan(0);
  });

  test("handles file without optional fields", () => {
    const file = normalizeDriveFile({
      id: "minimal",
      name: "test.txt",
      mimeType: "text/plain",
      createdTime: "2026-01-01T00:00:00.000Z",
      modifiedTime: "2026-01-01T00:00:00.000Z",
    });

    expect(file.parentId).toBe("");
    expect(file.size).toBe(0);
    expect(file.webViewLink).toBe("");
  });

  test("parses files list response with pagination", () => {
    const parsed = parseFilesListResponse(filesListFixture);

    expect(parsed.files).toHaveLength(3);
    expect(parsed.files[0].id).toBe("1a2b3c4d5e6f");
    expect(parsed.nextPageToken).toBe("drive_page_token_1");
  });

  test("parses empty files list response", () => {
    const parsed = parseFilesListResponse({ files: [] });

    expect(parsed.files).toHaveLength(0);
    expect(parsed.nextPageToken).toBeNull();
  });
});
