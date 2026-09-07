import { createGraphClient, parseGraphRateLimit, type GraphClient } from "./http";

export type DriveFile = {
  id: string;
  name: string;
  size?: number;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  [key: string]: unknown;
};

export type NormalizedFile = {
  id: string;
  provider: "microsoft-365";
  providerFileId: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  webUrl: string;
  isFolder: boolean;
  modelVersion: "2026-05-16";
  raw: DriveFile;
};

export function normalizeDriveFile(file: DriveFile): NormalizedFile {
  const isFolder = file.folder !== undefined && typeof file.folder?.childCount === "number";
  return {
    id: `onedrive:${file.id}`,
    provider: "microsoft-365",
    providerFileId: file.id,
    name: file.name,
    mimeType: file.file?.mimeType ?? (isFolder ? "application/vnd.microsoft.folder" : ""),
    size: file.size ?? 0,
    createdTime: file.createdDateTime ?? "",
    modifiedTime: file.lastModifiedDateTime ?? "",
    webUrl: file.webUrl ?? "",
    isFolder,
    modelVersion: "2026-05-16",
    raw: file,
  };
}

export function parseFilesResponse(response: unknown): { files: DriveFile[]; nextLink: string | null } {
  if (!isRecord(response)) return { files: [], nextLink: null };
  const value = response.value;
  if (!Array.isArray(value)) return { files: [], nextLink: null };
  return {
    files: value.filter(isRecord).map((f) => ({
      id: requireString(f.id, "id"),
      name: requireString(f.name, "name"),
      size: typeof f.size === "number" ? f.size : undefined,
      createdDateTime: typeof f.createdDateTime === "string" ? f.createdDateTime : undefined,
      lastModifiedDateTime: typeof f.lastModifiedDateTime === "string" ? f.lastModifiedDateTime : undefined,
      webUrl: typeof f.webUrl === "string" ? f.webUrl : undefined,
      file: isRecord(f.file) ? f.file : undefined,
      folder: isRecord(f.folder) ? f.folder : undefined,
    })),
    nextLink: parseNextOdataLink(response),
  };
}

function parseNextOdataLink(response: Record<string, unknown>): string | null {
  const link = response["@odata.nextLink"];
  return typeof link === "string" && link.length > 0 ? link : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Get Drive Item ───────────────────────────────────────────────────────────

export type GetDriveItemInput = { itemId: string };

export function validateGetDriveItemInput(input: unknown): GetDriveItemInput {
  if (!isRecord(input)) throw new Error("get drive item input must be an object");
  return { itemId: requireString(input.itemId, "itemId") };
}

// ─── Delete Drive Item ────────────────────────────────────────────────────────

export type DeleteDriveItemInput = { itemId: string };

export function validateDeleteDriveItemInput(input: unknown): DeleteDriveItemInput {
  if (!isRecord(input)) throw new Error("delete drive item input must be an object");
  return { itemId: requireString(input.itemId, "itemId") };
}

// ─── Copy Drive Item ──────────────────────────────────────────────────────────

export type CopyDriveItemInput = { itemId: string; destinationId: string; name?: string };

export function validateCopyDriveItemInput(input: unknown): CopyDriveItemInput {
  if (!isRecord(input)) throw new Error("copy drive item input must be an object");
  return {
    itemId: requireString(input.itemId, "itemId"),
    destinationId: requireString(input.destinationId, "destinationId"),
    name: typeof input.name === "string" ? input.name : undefined,
  };
}

export function createDriveItemsClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "drive.items.get" });

  return {
    async get(input: unknown) {
      const payload = validateGetDriveItemInput(input);
      const response = await client.fetchJSON(`/v1.0/me/drive/items/${encodeURIComponent(payload.itemId)}`);
      if (response.status === 200) {
        return { ok: true as const, item: normalizeDriveFile(response.body as DriveFile) };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the get drive item request." } };
    },

    async delete(input: unknown) {
      const payload = validateDeleteDriveItemInput(input);
      const response = await client.fetchJSON(`/v1.0/me/drive/items/${encodeURIComponent(payload.itemId)}`, {
        method: "DELETE",
      });
      if (response.status === 204) return { ok: true as const };
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the delete drive item request." } };
    },

    async copy(input: unknown) {
      const payload = validateCopyDriveItemInput(input);
      const body: Record<string, unknown> = {
        parentReference: { id: payload.destinationId },
      };
      if (payload.name) body.name = payload.name;

      const response = await client.fetchJSON(`/v1.0/me/drive/items/${encodeURIComponent(payload.itemId)}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 202) {
        return { ok: true as const, operationUrl: typeof response.headers["location"] === "string" ? response.headers["location"] : "" };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the copy drive item request." } };
    },
  };
}
