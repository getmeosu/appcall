import { describe, expect, test } from "bun:test";
import driveItemFixture from "../fixtures/drive_item.json";
import {
  validateGetDriveItemInput,
  validateDeleteDriveItemInput,
  validateCopyDriveItemInput,
  createDriveItemsClient,
} from "../src/files";

describe("microsoft-365 drive items extended (get/delete/copy)", () => {
  // ─── Static validation ───────────────────────────────────────────────────────

  test("validateGetDriveItemInput returns itemId", () => {
    const result = validateGetDriveItemInput({ itemId: "01DRIVEITEMID" });
    expect(result.itemId).toBe("01DRIVEITEMID");
  });

  test("validateGetDriveItemInput throws on missing itemId", () => {
    expect(() => validateGetDriveItemInput({})).toThrow("itemId is required");
    expect(() => validateGetDriveItemInput("string")).toThrow();
  });

  test("validateDeleteDriveItemInput returns itemId", () => {
    const result = validateDeleteDriveItemInput({ itemId: "item-to-delete" });
    expect(result.itemId).toBe("item-to-delete");
  });

  test("validateCopyDriveItemInput returns all fields", () => {
    const result = validateCopyDriveItemInput({ itemId: "src-id", destinationId: "dst-id", name: "copy-of-doc.docx" });
    expect(result.itemId).toBe("src-id");
    expect(result.destinationId).toBe("dst-id");
    expect(result.name).toBe("copy-of-doc.docx");
  });

  test("validateCopyDriveItemInput throws on missing required fields", () => {
    expect(() => validateCopyDriveItemInput({ itemId: "src" })).toThrow("destinationId is required");
    expect(() => validateCopyDriveItemInput({ destinationId: "dst" })).toThrow("itemId is required");
  });

  // ─── Mocked HTTP: drive.items.get ────────────────────────────────────────────

  test("getDriveItem GETs /v1.0/me/drive/items/{id} with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createDriveItemsClient({
      accessToken: "tok-drive-get",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(driveItemFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.get({ itemId: "01DRIVEITEMID" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/drive/items/01DRIVEITEMID");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-drive-get");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.providerFileId).toBe("01DRIVEITEMID");
      expect(result.item.name).toBe("document.docx");
      expect(result.item.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    }
  });

  test("getDriveItem maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createDriveItemsClient({
      accessToken: "tok-drive-get",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "25" } }),
    });

    const result = await client.get({ itemId: "item1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(25);
    }
  });

  test("getDriveItem maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createDriveItemsClient({
      accessToken: "tok-drive-get",
      fetch: async () => new Response("{}", { status: 404 }),
    });

    const result = await client.get({ itemId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: drive.items.delete ─────────────────────────────────────────

  test("deleteDriveItem sends DELETE and returns ok on 204", async () => {
    const requests: Request[] = [];
    const client = createDriveItemsClient({
      accessToken: "tok-drive-del",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });

    const result = await client.delete({ itemId: "itemToDelete" });

    expect(requests[0].url).toContain("/me/drive/items/itemToDelete");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-drive-del");
    expect(result.ok).toBe(true);
  });

  test("deleteDriveItem maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createDriveItemsClient({
      accessToken: "tok-drive-del",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
    });

    const result = await client.delete({ itemId: "item1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── Mocked HTTP: drive.items.copy ───────────────────────────────────────────

  test("copyDriveItem POSTs to /copy and returns operation URL on 202", async () => {
    const requests: Request[] = [];
    const client = createDriveItemsClient({
      accessToken: "tok-drive-copy",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 202, headers: { "Location": "https://graph.microsoft.com/v1.0/me/drive/operations/op123" } });
      },
    });

    const result = await client.copy({ itemId: "src-item", destinationId: "dst-folder", name: "copy.docx" });

    expect(requests[0].url).toContain("/me/drive/items/src-item/copy");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-drive-copy");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operationUrl).toBe("https://graph.microsoft.com/v1.0/me/drive/operations/op123");
    }
  });

  test("copyDriveItem maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createDriveItemsClient({
      accessToken: "tok-drive-copy",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "8" } }),
    });

    const result = await client.copy({ itemId: "src", destinationId: "dst" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("copyDriveItem maps non-202/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createDriveItemsClient({
      accessToken: "tok-drive-copy",
      fetch: async () => new Response("{}", { status: 400 }),
    });

    const result = await client.copy({ itemId: "src", destinationId: "dst" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
