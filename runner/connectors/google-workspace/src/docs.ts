import { createGoogleClient, parseGoogleError, parseGoogleRateLimitMetadata, type ConnectorError } from "./http";
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
  const createHttpClient = (operation: string): ConnectorHttpClient => createGoogleClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    httpClient: options.httpClient,
    operation,
  });
  const authHeaders = { Authorization: `Bearer ${options.accessToken}` };
  const jsonHeaders = { ...authHeaders, "Content-Type": "application/json" };

  return {
    async getDocument(input: unknown): Promise<GetDocumentResult> {
      const payload = validateGetDocumentInput(input);
      const params = new URLSearchParams();
      params.set("includeTabsContent", "true");

      const response = await createHttpClient("docs.get").fetchText(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(payload.documentId)}?${params}`,
        {
          headers: authHeaders,
        },
      );
      const body = readJsonObject(response.body);
      const parsedError = parseGoogleError(body);
      if (response.status >= 400 || parsedError?.code === "CONNECTOR_RATE_LIMITED") {
        throwGoogleResponseError(response, parsedError, "Docs API rejected the request");
      }
      return parseDocumentResponse(body);
    },

    async createDocument(input: unknown): Promise<CreateDocumentResult> {
      const payload = validateCreateDocumentInput(input);
      const response = await createHttpClient("docs.create").fetchText(
        "https://docs.googleapis.com/v1/documents",
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ title: payload.title }),
        },
      );
      const body = readJsonObject(response.body);
      const parsedError = parseGoogleError(body);
      if (response.status >= 400 || parsedError?.code === "CONNECTOR_RATE_LIMITED") {
        throwGoogleResponseError(response, parsedError, "Docs API rejected the create request");
      }
      return {
        documentId: requireString(body.documentId, "documentId"),
        title: typeof body.title === "string" ? body.title : payload.title,
        revisionId: String(body.revisionId ?? ""),
      };
    },

    async updateDocument(input: unknown): Promise<UpdateDocumentResult> {
      const payload = validateUpdateDocumentInput(input);
      const googleRequests = payload.requests.map(toGoogleDocsRequest);
      const response = await createHttpClient("docs.update").fetchText(
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(payload.documentId)}:batchUpdate`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ requests: googleRequests }),
        },
      );
      const body = readJsonObject(response.body);
      const parsedError = parseGoogleError(body);
      if (response.status >= 400 || parsedError?.code === "CONNECTOR_RATE_LIMITED") {
        throwGoogleResponseError(response, parsedError, "Docs API rejected the update request");
      }
      return {
        documentId: String(body.documentId ?? payload.documentId),
        replies: Array.isArray(body.replies) ? body.replies : [],
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

export type SafeDocsUpdateRequest =
  | { insertText: { index: number; text: string } }
  | { deleteContentRange: { startIndex: number; endIndex: number } }
  | { replaceAllText: { find: string; replace: string; matchCase?: boolean } };

export type UpdateDocumentInput = {
  documentId: string;
  requests: SafeDocsUpdateRequest[];
};

export type UpdateDocumentResult = {
  documentId: string;
  replies: unknown[];
};

export function validateUpdateDocumentInput(input: unknown): UpdateDocumentInput {
  if (!isRecord(input)) throw new Error("update document input must be an object");
  const documentId = requireString(input.documentId, "documentId");
  if (!Array.isArray(input.requests)) throw new Error("requests must be an array");
  if (input.requests.length === 0) throw new Error("requests must not be empty");
  if (input.requests.length > 50) throw new Error("requests must contain at most 50 items");
  return {
    documentId,
    requests: input.requests.map(validateSafeDocsUpdateRequest),
  };
}

function validateSafeDocsUpdateRequest(value: unknown): SafeDocsUpdateRequest {
  if (!isRecord(value)) throw new Error("docs update request must be an object");
  const keys = Object.keys(value);
  if (keys.length !== 1) throw new Error("docs update request must contain exactly one supported operation");
  if (isRecord(value.insertText)) {
    return {
      insertText: {
        index: requireNumber(value.insertText.index, "insertText.index"),
        text: requireString(value.insertText.text, "insertText.text"),
      },
    };
  }
  if (isRecord(value.deleteContentRange)) {
    return {
      deleteContentRange: {
        startIndex: requireNumber(value.deleteContentRange.startIndex, "deleteContentRange.startIndex"),
        endIndex: requireNumber(value.deleteContentRange.endIndex, "deleteContentRange.endIndex"),
      },
    };
  }
  if (isRecord(value.replaceAllText)) {
    return {
      replaceAllText: {
        find: requireString(value.replaceAllText.find, "replaceAllText.find"),
        replace: requireString(value.replaceAllText.replace, "replaceAllText.replace"),
        matchCase: typeof value.replaceAllText.matchCase === "boolean" ? value.replaceAllText.matchCase : undefined,
      },
    };
  }
  throw new Error(`unsupported docs update operation: ${keys[0] ?? "unknown"}`);
}

function toGoogleDocsRequest(request: SafeDocsUpdateRequest): Record<string, unknown> {
  if ("insertText" in request) {
    return { insertText: { location: { index: request.insertText.index }, text: request.insertText.text } };
  }
  if ("deleteContentRange" in request) {
    return {
      deleteContentRange: {
        range: { startIndex: request.deleteContentRange.startIndex, endIndex: request.deleteContentRange.endIndex },
      },
    };
  }
  return {
    replaceAllText: {
      containsText: { text: request.replaceAllText.find, matchCase: request.replaceAllText.matchCase ?? false },
      replaceText: request.replaceAllText.replace,
    },
  };
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

export type DocsClient = {
  getDocument(input: unknown): Promise<GetDocumentResult>;
  createDocument(input: unknown): Promise<CreateDocumentResult>;
  updateDocument(input: unknown): Promise<UpdateDocumentResult>;
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

type GoogleResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

function throwGoogleResponseError(
  response: GoogleResponse,
  parsedError: ConnectorError | null,
  fallbackMessage: string,
): never {
  const rateLimit = parseGoogleRateLimitMetadata(
    parsedError?.code === "CONNECTOR_RATE_LIMITED" ? 429 : response.status,
    response.headers,
    parsedError?.retryAfterSeconds,
  );
  if (rateLimit.limited) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Docs API rate limit exceeded.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }
  throw {
    ok: false,
    ...(parsedError ?? { code: "CONNECTOR_UPSTREAM_ERROR", message: fallbackMessage }),
  };
}
