import { describe, expect, test } from "bun:test";
import filesListFixture from "../fixtures/files_list.json";
import {
  normalizeDriveFile,
  parseFilesResponse,
} from "../src/files";

describe("microsoft-365 files", () => {
  test("normalizes OneDrive file from fixture", () => {
    const file = normalizeDriveFile(filesListFixture.value[0]);

    expect(file.id).toBe("onedrive:01ABCD1234XYZ567!123");
    expect(file.provider).toBe("microsoft-365");
    expect(file.providerFileId).toBe("01ABCD1234XYZ567!123");
    expect(file.name).toBe("Project Report.pdf");
    expect(file.mimeType).toBe("application/pdf");
    expect(file.size).toBe(524288);
    expect(file.createdTime).toBe("2026-01-15T10:30:00Z");
    expect(file.modifiedTime).toBe("2026-05-01T14:20:00Z");
    expect(file.webUrl).toBe("https://onedrive.live.com/redir?resid=01ABCD1234XYZ567!123");
    expect(file.isFolder).toBe(false);
    expect(file.modelVersion).toBe("2026-05-16");
    expect(file.raw.name).toBe("Project Report.pdf");
  });

  test("normalizes OneDrive folder from fixture", () => {
    const file = normalizeDriveFile(filesListFixture.value[1]);

    expect(file.id).toBe("onedrive:01ABCD1234XYZ567!456");
    expect(file.name).toBe("Design Assets");
    expect(file.mimeType).toBe("application/vnd.microsoft.folder");
    expect(file.isFolder).toBe(true);
  });

  test("normalizes file with minimal fields", () => {
    const file = normalizeDriveFile({ id: "min-id", name: "test.txt" });

    expect(file.id).toBe("onedrive:min-id");
    expect(file.name).toBe("test.txt");
    expect(file.mimeType).toBe("");
    expect(file.size).toBe(0);
    expect(file.isFolder).toBe(false);
    expect(file.webUrl).toBe("");
  });

  test("parses files list response with nextLink", () => {
    const parsed = parseFilesResponse(filesListFixture);

    expect(parsed.files).toHaveLength(3);
    expect(parsed.files[0].id).toBe("01ABCD1234XYZ567!123");
    expect(parsed.files[1].id).toBe("01ABCD1234XYZ567!456");
    expect(parsed.nextLink).toBe("https://graph.microsoft.com/v1.0/me/drive/root/children?$skipToken=abc");
  });

  test("parses files list response without nextLink", () => {
    const parsed = parseFilesResponse({ value: [{ id: "f1", name: "test.txt" }] });

    expect(parsed.files).toHaveLength(1);
    expect(parsed.nextLink).toBeNull();
  });

  test("parses empty files list response", () => {
    const parsed = parseFilesResponse({ value: [] });

    expect(parsed.files).toHaveLength(0);
    expect(parsed.nextLink).toBeNull();
  });

  test("handles non-object response gracefully", () => {
    expect(parseFilesResponse(null)).toEqual({ files: [], nextLink: null });
    expect(parseFilesResponse("string")).toEqual({ files: [], nextLink: null });
  });
});
