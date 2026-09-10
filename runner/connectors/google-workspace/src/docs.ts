import { createGoogleClient } from "./http";
import type { ConnectorHttpClient } from "../../../bun/src/http";

export type GetDocumentInput = {
  documentId: string;
};

export type GoogleDocumentTab = {
  documentTab?: Record<string, unknown>;
  childTabs?: GoogleDocumentTab[];
  [key: string]: unknown;
};

export type GetDocumentResult = {
  documentId: string;
  title: string;
  body: unknown;
  revisionId: string;
  tabs?: GoogleDocumentTab[];
};

export function validateGetDocumentInput(input: unknown): GetDocumentInput {
  if (!isRecord(input)) {
    throw new Error("get document input must be an object");
  }
  return {
    documentId: requireString(input.documentId ?? input.id, "documentId"),
  };
}

export function parseDocumentResponse(response: unknown): GetDocumentResult {
  if (!isRecord(response)) {
    throw new Error("invalid document response");
  }
  const title = isRecord(response.title) ? response.title : (typeof response.title === "string" ? response.title : "");
  const tabs = Array.isArray(response.tabs) ? response.tabs as GoogleDocumentTab[] : undefined;
  const firstDocumentTab = tabs !== undefined && isRecord(tabs[0]) && isRecord(tabs[0].documentTab)
    ? tabs[0].documentTab
    : undefined;
  const body = firstDocumentTab !== undefined && "body" in firstDocumentTab
    ? firstDocumentTab.body
    : response.body;
  return {
    documentId: requireString(response.documentId, "documentId"),
    title: typeof title === "string" ? title : "",
    body,
    revisionId: String(response.revisionId ?? ""),
    ...(tabs === undefined ? {} : { tabs }),
  };
}

export function createDocsClient(options: { accessToken: string; fetch?: typeof fetch; httpClient?: ConnectorHttpClient }): DocsClient {
  const httpClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "docs.get" });
  const authHeaders = { Authorization: `Bearer ${options.accessToken}` };
  const jsonHeaders = { ...authHeaders, "Content-Type": "application/json" };

  return {
    async getDocument(input: unknown): Promise<GetDocumentResult> {
      const payload = validateGetDocumentInput(input);
      const params = new URLSearchParams();
      params.set("includeTabsContent", "true");

      const response = await httpClient.fetchText(
        `https://www.googleapis.com/v1/documents/${encodeURIComponent(payload.documentId)}?${params}`,
        {
          headers: authHeaders,
        },
      );
      const body = readJsonObject(response.body);
      if (response.status >= 400) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Docs API rejected the request", providerError: String(body) };
      }
      return parseDocumentResponse(body);
    },

    async createDocument(input: unknown): Promise<CreateDocumentResult> {
      const payload = validateCreateDocumentInput(input);
      const response = await httpClient.fetchText(
        "https://www.googleapis.com/v1/documents",
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ title: payload.title }),
        },
      );
      const body = readJsonObject(response.body);
      if (response.status >= 400) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Docs API rejected the create request", providerError: String(body) };
      }
      return {
        documentId: requireString(body.documentId, "documentId"),
        title: typeof body.title === "string" ? body.title : payload.title,
        revisionId: String(body.revisionId ?? ""),
      };
    },
  };
}

export type CreateDocumentInput = {
  title: string;
};

export type CreateDocumentResult = {
  documentId: string;
  title: string;
  revisionId: string;
};

export function validateCreateDocumentInput(input: unknown): CreateDocumentInput {
  if (!isRecord(input)) throw new Error("create document input must be an object");
  return {
    title: requireString(input.title, "title"),
  };
}

export type DocsClient = {
  getDocument(input: unknown): Promise<GetDocumentResult>;
  createDocument(input: unknown): Promise<CreateDocumentResult>;
};

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(bodyText);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
