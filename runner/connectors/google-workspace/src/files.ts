import { createGoogleClient, parseGoogleError, parseGoogleRateLimitMetadata, parseNextPageToken, type ConnectorError } from "./http";
import type { ConnectorHttpClient } from "../../../bun/src/http";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  driveId?: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  trashed?: boolean;
  [key: string]: unknown;
};

export type NormalizedFile = {
  id: string;
  provider: "google-workspace";
  providerFileId: string;
  name: string;
  mimeType: string;
  parentId: string;
  createdTime: string;
  modifiedTime: string;
  size: number;
  webViewLink: string;
  modelVersion: "2026-05-16";
  raw: DriveFile;
};

export function normalizeDriveFile(file: DriveFile): NormalizedFile {
  return {
    id: `drive:${file.id}`,
    provider: "google-workspace",
    providerFileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parentId: (file.parents ?? [])[0] ?? "",
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    size: file.size ? parseInt(file.size, 10) : 0,
    webViewLink: file.webViewLink ?? "",
    modelVersion: "2026-05-16",
    raw: file,
  };
}

export function parseFilesListResponse(response: unknown): { files: DriveFile[]; nextPageToken: string | null } {
  if (!isRecord(response)) {
    return { files: [], nextPageToken: null };
  }
  const rawFiles = response.files;
  if (!Array.isArray(rawFiles)) {
    return { files: [], nextPageToken: parseNextPageToken(response) };
  }
  return {
    files: rawFiles.filter(isRecord).map((f) => ({
      id: requireString(f.id, "id"),
      name: requireString(f.name, "name"),
      mimeType: requireString(f.mimeType, "mimeType"),
      parents: Array.isArray(f.parents) ? f.parents.filter((p): p is string => typeof p === "string") : undefined,
      driveId: typeof f.driveId === "string" ? f.driveId : undefined,
      createdTime: requireString(f.createdTime ?? f.modifiedTime, "createdTime"),
      modifiedTime: requireString(f.modifiedTime ?? f.createdTime, "modifiedTime"),
      size: typeof f.size === "string" ? f.size : undefined,
      webViewLink: typeof f.webViewLink === "string" ? f.webViewLink : undefined,
      trashed: typeof f.trashed === "boolean" ? f.trashed : undefined,
    })),
    nextPageToken: parseNextPageToken(response),
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// =====================================================================
// Action operations: drive.files.get, drive.files.create,
//                    drive.files.delete, drive.permissions.create
// =====================================================================

export type GetFileInput = { fileId: string; fields?: string };
export type CreateDriveFileInput = { name: string; mimeType: string; parents?: string[]; description?: string };
export type DeleteFileInput = { fileId: string };
export type CreatePermissionInput = { fileId: string; role: string; type: string; emailAddress?: string; sendNotificationEmail?: boolean };

export type DriveFileActionResult =
  | { ok: true; file: { id: string; name: string; mimeType: string; webViewLink?: string; parents?: string[]; createdTime?: string; modifiedTime?: string; size?: string } }
  | { ok: false; error: ConnectorError };

export type DeleteFileResult =
  | { ok: true; deleted: boolean; fileId: string }
  | { ok: false; error: ConnectorError };

export type CreatePermissionResult =
  | { ok: true; permission: { permissionId: string; role: string; type: string; emailAddress?: string } }
  | { ok: false; error: ConnectorError };

export function validateGetFileInput(input: unknown): GetFileInput {
  if (!isRecord(input)) throw new Error("get file input must be an object");
  return {
    fileId: requireString(input.fileId, "fileId"),
    fields: typeof input.fields === "string" ? input.fields : undefined,
  };
}

export function validateCreateDriveFileInput(input: unknown): CreateDriveFileInput {
  if (!isRecord(input)) throw new Error("create file input must be an object");
  return {
    name: requireString(input.name, "name"),
    mimeType: requireString(input.mimeType, "mimeType"),
    parents: Array.isArray(input.parents) ? input.parents.filter((p): p is string => typeof p === "string") : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
  };
}

export function validateDeleteFileInput(input: unknown): DeleteFileInput {
  if (!isRecord(input)) throw new Error("delete file input must be an object");
  return { fileId: requireString(input.fileId, "fileId") };
}

export function validateCreatePermissionInput(input: unknown): CreatePermissionInput {
  if (!isRecord(input)) throw new Error("create permission input must be an object");
  return {
    fileId: requireString(input.fileId, "fileId"),
    role: requireString(input.role, "role"),
    type: requireString(input.type, "type"),
    emailAddress: typeof input.emailAddress === "string" ? input.emailAddress : undefined,
    sendNotificationEmail: typeof input.sendNotificationEmail === "boolean" ? input.sendNotificationEmail : undefined,
  };
}

async function handleDriveResponse(response: { status: number; headers: Record<string, string>; body: string }): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
  const rateLimit = parseGoogleRateLimitMetadata(response.status, response.headers);
  if (rateLimit.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Drive rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
  }
  let body: Record<string, unknown> = {};
  if (response.body.trim() !== "") {
    try { body = JSON.parse(response.body); } catch { /* ignore */ }
    if (!isRecord(body)) body = {};
  }
  if (response.status >= 400) {
    const parsed = parseGoogleError(body);
    return { ok: false, error: parsed ?? { code: "CONNECTOR_UPSTREAM_ERROR", message: "Drive API error." } };
  }
  return { ok: true, body };
}

export type DriveActionsClient = {
  getFile(input: unknown): Promise<DriveFileActionResult>;
  createFile(input: unknown): Promise<DriveFileActionResult>;
  deleteFile(input: unknown): Promise<DeleteFileResult>;
  createPermission(input: unknown): Promise<CreatePermissionResult>;
};

export function createDriveActionsClient(options: { accessToken: string; fetch?: typeof fetch; httpClient?: ConnectorHttpClient }): DriveActionsClient {
  const getClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "drive.files.get" });
  const createClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "drive.files.create" });
  const deleteClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "drive.files.delete" });
  const permissionClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "drive.permissions.create" });
  const authHeaders = { Authorization: `Bearer ${options.accessToken}` };
  const jsonHeaders = { ...authHeaders, "Content-Type": "application/json" };

  const DEFAULT_FILE_FIELDS = "id,name,mimeType,parents,webViewLink,createdTime,modifiedTime,size";

  function normalizeFile(b: Record<string, unknown>): DriveFileActionResult["file"] {
    return {
      id: typeof b.id === "string" ? b.id : "",
      name: typeof b.name === "string" ? b.name : "",
      mimeType: typeof b.mimeType === "string" ? b.mimeType : "",
      webViewLink: typeof b.webViewLink === "string" ? b.webViewLink : undefined,
      parents: Array.isArray(b.parents) ? b.parents.filter((p): p is string => typeof p === "string") : undefined,
      createdTime: typeof b.createdTime === "string" ? b.createdTime : undefined,
      modifiedTime: typeof b.modifiedTime === "string" ? b.modifiedTime : undefined,
      size: typeof b.size === "string" ? b.size : undefined,
    };
  }

  return {
    async getFile(input: unknown): Promise<DriveFileActionResult> {
      const p = validateGetFileInput(input);
      const params = new URLSearchParams();
      params.set("fields", p.fields ?? DEFAULT_FILE_FIELDS);
      const response = await getClient.fetchText(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(p.fileId)}?${params}`,
        { headers: authHeaders },
      );
      const res = await handleDriveResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, file: normalizeFile(res.body) };
    },

    async createFile(input: unknown): Promise<DriveFileActionResult> {
      const p = validateCreateDriveFileInput(input);
      const body: Record<string, unknown> = { name: p.name, mimeType: p.mimeType };
      if (p.parents) body.parents = p.parents;
      if (p.description) body.description = p.description;
      const params = new URLSearchParams({ fields: DEFAULT_FILE_FIELDS });
      const response = await createClient.fetchText(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) },
      );
      const res = await handleDriveResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, file: normalizeFile(res.body) };
    },

    async deleteFile(input: unknown): Promise<DeleteFileResult> {
      const p = validateDeleteFileInput(input);
      const response = await deleteClient.fetchText(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(p.fileId)}`,
        { method: "DELETE", headers: authHeaders },
      );
      const rateLimit = parseGoogleRateLimitMetadata(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Drive rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 204 || response.status === 200) {
        return { ok: true, deleted: true, fileId: p.fileId };
      }
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(response.body); } catch { /* ignore */ }
      if (!isRecord(body)) body = {};
      const parsed = parseGoogleError(body);
      return { ok: false, error: parsed ?? { code: "CONNECTOR_UPSTREAM_ERROR", message: "Drive API error deleting file." } };
    },

    async createPermission(input: unknown): Promise<CreatePermissionResult> {
      const p = validateCreatePermissionInput(input);
      const body: Record<string, unknown> = { role: p.role, type: p.type };
      if (p.emailAddress) body.emailAddress = p.emailAddress;
      const params = new URLSearchParams({ fields: "id,role,type,emailAddress" });
      if (p.sendNotificationEmail !== undefined) params.set("sendNotificationEmail", String(p.sendNotificationEmail));
      const response = await permissionClient.fetchText(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(p.fileId)}/permissions?${params}`,
        { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) },
      );
      const res = await handleDriveResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const b = res.body;
      return {
        ok: true,
        permission: {
          permissionId: typeof b.id === "string" ? b.id : "",
          role: typeof b.role === "string" ? b.role : p.role,
          type: typeof b.type === "string" ? b.type : p.type,
          emailAddress: typeof b.emailAddress === "string" ? b.emailAddress : undefined,
        },
      };
    },
  };
}
