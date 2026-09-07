import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import {
  appendDocumentTextBlock,
  listBlockChildren,
  validateBlocksAppendInput,
  validateBlocksListInput,
  type BlocksAppendInput,
  type BlocksAppendResult,
  type BlocksListInput,
  type BlocksListResult,
} from "./block_actions";
import {
  createNotionComment,
  listNotionComments,
  validateCommentsCreateInput,
  validateCommentsListInput,
  type CommentsCreateInput,
  type CommentsCreateResult,
  type CommentsListInput,
  type CommentsListResult,
} from "./comment_actions";
import {
  hasLiveCredentialValidation,
  validateCredentialInput,
  validateCredentialsLive,
} from "./credentials";
import {
  createNotionDatabaseItem,
  getNotionDatabase,
  getNotionDatabaseItem,
  listNotionDatabaseItems,
  updateNotionDatabaseItem,
  validateDatabaseItemsCreateInput,
  validateDatabaseItemsGetInput,
  validateDatabaseItemsQueryInput,
  validateDatabaseItemsUpdateInput,
  validateDatabasesGetInput,
  type DatabaseItemsCreateResult,
  type DatabaseItemsCreateInput,
  type DatabaseItemsGetInput,
  type DatabaseItemsGetResult,
  type DatabaseItemsQueryInput,
  type DatabaseItemsQueryResult,
  type DatabaseItemsUpdateInput,
  type DatabaseItemsUpdateResult,
  type DatabasesGetResult,
  type DatabasesGetInput,
} from "./database_actions";
import {
  createNotionDocument,
  getNotionDocument,
  searchNotionDocuments,
  updatePageTrashState,
  validateDocumentsCreateInput,
  validateDocumentsGetInput,
  validateDocumentsSearchInput,
  validateDocumentsTrashInput,
  type DocumentsCreateInput,
  type DocumentsCreateResult,
  type DocumentsGetInput,
  type DocumentsGetResult,
  type DocumentsSearchInput,
  type DocumentsSearchResult,
  type DocumentsTrashInput,
  type DocumentsTrashResult,
} from "./document_actions";
import { isConnectorHttpClient, isRecord, requireNonEmptyString } from "./http";

export { validateCredentialsLive } from "./credentials";

export type NotionDocumentsClient = {
  search(input: DocumentsSearchInput): Promise<DocumentsSearchResult>;
  get(input: DocumentsGetInput): Promise<DocumentsGetResult>;
  create(input: DocumentsCreateInput): Promise<DocumentsCreateResult>;
  trash(input: DocumentsTrashInput): Promise<DocumentsTrashResult>;
  restore(input: DocumentsTrashInput): Promise<DocumentsTrashResult>;
  getDatabase(input: DatabasesGetInput): Promise<DatabasesGetResult>;
  getDatabaseItem(input: DatabaseItemsGetInput): Promise<DatabaseItemsGetResult>;
  listDatabaseItems(input: DatabaseItemsQueryInput): Promise<DatabaseItemsQueryResult>;
  createDatabaseItem(input: DatabaseItemsCreateInput): Promise<DatabaseItemsCreateResult>;
  updateDatabaseItem(input: DatabaseItemsUpdateInput): Promise<DatabaseItemsUpdateResult>;
  listBlocks(input: BlocksListInput): Promise<BlocksListResult>;
  appendText(input: BlocksAppendInput): Promise<BlocksAppendResult>;
  listComments(input: CommentsListInput): Promise<CommentsListResult>;
  createComment(input: CommentsCreateInput): Promise<CommentsCreateResult>;
};


export type NotionDocumentsClientOptions = {
  notionToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export function validateCredentials(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasLiveCredentialValidation(input)) {
    return validateCredentialsLive(input);
  }
  const notionToken = validateCredentialInput(input).notionToken;
  void notionToken;
  return {
    connector: "notion",
    action: "credentials.validate",
    source: "connector",
    valid: true,
  };
}

export function searchDocuments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).search(input).then((result) => ({
      connector: "notion",
      action: "documents.search",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "documents.search",
    source: "connector",
    validated: validateDocumentsSearchInput(input),
  };
}

export function getDocument(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).get(validateDocumentsGetInput(input)).then((result) => ({
      connector: "notion",
      action: "documents.get",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "documents.get",
    source: "connector",
    validated: validateDocumentsGetInput(input),
  };
}

export function createDocument(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).create(validateDocumentsCreateInput(input)).then((result) => ({
      connector: "notion",
      action: "documents.create",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "documents.create",
    source: "connector",
    validated: validateDocumentsCreateInput(input),
  };
}

export function trashDocument(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return updateDocumentTrashState("documents.trash", true, input);
}

export function restoreDocument(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return updateDocumentTrashState("documents.restore", false, input);
}

export function trashDatabaseItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return updateDocumentTrashState("databases.items.trash", true, input);
}

export function restoreDatabaseItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return updateDocumentTrashState("databases.items.restore", false, input);
}

export function getDatabase(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).getDatabase(validateDatabasesGetInput(input)).then((result) => ({
      connector: "notion",
      action: "databases.get",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "databases.get",
    source: "connector",
    validated: validateDatabasesGetInput(input),
  };
}

export function listDatabaseItems(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).listDatabaseItems(validateDatabaseItemsQueryInput(input)).then((result) => ({
      connector: "notion",
      action: "databases.items.query",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "databases.items.query",
    source: "connector",
    validated: validateDatabaseItemsQueryInput(input),
  };
}

export function getDatabaseItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).getDatabaseItem(validateDatabaseItemsGetInput(input)).then((result) => ({
      connector: "notion",
      action: "databases.items.get",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "databases.items.get",
    source: "connector",
    validated: validateDatabaseItemsGetInput(input),
  };
}

export function createDatabaseItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).createDatabaseItem(validateDatabaseItemsCreateInput(input)).then((result) => ({
      connector: "notion",
      action: "databases.items.create",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "databases.items.create",
    source: "connector",
    validated: validateDatabaseItemsCreateInput(input),
  };
}

export function updateDatabaseItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).updateDatabaseItem(validateDatabaseItemsUpdateInput(input)).then((result) => ({
      connector: "notion",
      action: "databases.items.update",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "databases.items.update",
    source: "connector",
    validated: validateDatabaseItemsUpdateInput(input),
  };
}

function updateDocumentTrashState(
  action: "documents.trash" | "documents.restore" | "databases.items.trash" | "databases.items.restore",
  inTrash: boolean,
  input: unknown,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    const client = createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    });
    const page = validateDocumentsTrashInput(input);
    return (inTrash ? client.trash(page) : client.restore(page)).then((result) => ({
      connector: "notion",
      action,
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action,
    source: "connector",
    validated: validateDocumentsTrashInput(input),
  };
}

export function listDocumentBlocks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).listBlocks(validateBlocksListInput(input)).then((result) => ({
      connector: "notion",
      action: "documents.blocks.list",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "documents.blocks.list",
    source: "connector",
    validated: validateBlocksListInput(input),
  };
}

export function appendDocumentText(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).appendText(validateBlocksAppendInput(input)).then((result) => ({
      connector: "notion",
      action: "documents.blocks.append",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "documents.blocks.append",
    source: "connector",
    validated: validateBlocksAppendInput(input),
  };
}

export function listComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).listComments(validateCommentsListInput(input)).then((result) => ({
      connector: "notion",
      action: "comments.list",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "comments.list",
    source: "connector",
    validated: validateCommentsListInput(input),
  };
}

export function createComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const { notionToken } = validateCredentialInput(input);
    return createNotionDocumentsClient({
      notionToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      httpClient: isConnectorHttpClient(input.httpClient) ? input.httpClient : undefined,
    }).createComment(validateCommentsCreateInput(input)).then((result) => ({
      connector: "notion",
      action: "comments.create",
      source: "connector",
      ...result,
    }));
  }

  return {
    connector: "notion",
    action: "comments.create",
    source: "connector",
    validated: validateCommentsCreateInput(input),
  };
}

export function createNotionDocumentsClient(options: NotionDocumentsClientOptions): NotionDocumentsClient {
  const notionToken = requireNonEmptyString(options.notionToken, "notionToken");
  const httpClient = options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["documents.search"].maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async search(input: DocumentsSearchInput): Promise<DocumentsSearchResult> {
      const documentInput = validateDocumentsSearchInput(input);
      return searchNotionDocuments(httpClient, notionToken, documentInput);
    },
    async get(input: DocumentsGetInput): Promise<DocumentsGetResult> {
      const page = validateDocumentsGetInput(input);
      return getNotionDocument(httpClient, notionToken, page);
    },
    async create(input: DocumentsCreateInput): Promise<DocumentsCreateResult> {
      const documentInput = validateDocumentsCreateInput(input);
      return createNotionDocument(httpClient, notionToken, documentInput);
    },
    trash(input: DocumentsTrashInput): Promise<DocumentsTrashResult> {
      return updatePageTrashState(httpClient, notionToken, validateDocumentsTrashInput(input), true);
    },
    restore(input: DocumentsTrashInput): Promise<DocumentsTrashResult> {
      return updatePageTrashState(httpClient, notionToken, validateDocumentsTrashInput(input), false);
    },
    async getDatabase(input: DatabasesGetInput): Promise<DatabasesGetResult> {
      const databaseInput = validateDatabasesGetInput(input);
      return getNotionDatabase(httpClient, notionToken, databaseInput);
    },
    async listDatabaseItems(input: DatabaseItemsQueryInput): Promise<DatabaseItemsQueryResult> {
      const queryInput = validateDatabaseItemsQueryInput(input);
      return listNotionDatabaseItems(httpClient, notionToken, queryInput);
    },
    async getDatabaseItem(input: DatabaseItemsGetInput): Promise<DatabaseItemsGetResult> {
      const itemInput = validateDatabaseItemsGetInput(input);
      return getNotionDatabaseItem(httpClient, notionToken, itemInput);
    },
    async createDatabaseItem(input: DatabaseItemsCreateInput): Promise<DatabaseItemsCreateResult> {
      const createInput = validateDatabaseItemsCreateInput(input);
      return createNotionDatabaseItem(httpClient, notionToken, createInput);
    },
    async updateDatabaseItem(input: DatabaseItemsUpdateInput): Promise<DatabaseItemsUpdateResult> {
      const updateInput = validateDatabaseItemsUpdateInput(input);
      return updateNotionDatabaseItem(httpClient, notionToken, updateInput);
    },
    async listBlocks(input: BlocksListInput): Promise<BlocksListResult> {
      const blockInput = validateBlocksListInput(input);
      return listBlockChildren(httpClient, notionToken, blockInput, 0);
    },
    async appendText(input: BlocksAppendInput): Promise<BlocksAppendResult> {
      const appendInput = validateBlocksAppendInput(input);
      return appendDocumentTextBlock(httpClient, notionToken, appendInput);
    },
    async listComments(input: CommentsListInput): Promise<CommentsListResult> {
      const commentsInput = validateCommentsListInput(input);
      return listNotionComments(httpClient, notionToken, commentsInput);
    },
    async createComment(input: CommentsCreateInput): Promise<CommentsCreateResult> {
      const commentInput = validateCommentsCreateInput(input);
      return createNotionComment(httpClient, notionToken, commentInput);
    },
  };
}
