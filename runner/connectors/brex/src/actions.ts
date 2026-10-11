import { asRecord, brexFetch, envelope, isRecord } from "./http";

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${key} is required.` };
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${key} is invalid.` };
  }
  return value;
}

function itemsOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data) && Array.isArray(data.items)) return data.items;
  return [];
}

function nextCursorOf(data: unknown): unknown {
  return isRecord(data) ? data.next_cursor ?? null : null;
}

function postedDate(item: unknown): string {
  if (!isRecord(item)) return "";
  const raw = item.posted_at_date;
  return typeof raw === "string" ? raw.slice(0, 10) : "";
}

function usdAmount(item: unknown): number {
  if (!isRecord(item) || !isRecord(item.amount)) return Number.NaN;
  const cents = item.amount.amount;
  return typeof cents === "number" ? cents / 100 : Number.NaN;
}

export async function updateCardStatus(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  if (typeof record.apiKey !== "string") {
    return { connector: "brex", action: "cards.update_status", source: "connector", validated: record };
  }
  const cardId = requireString(record, "card_id");
  const status = requireString(record, "status");
  const idempotency = optionalString(record, "idempotency_key");
  const headers = idempotency ? { "Idempotency-Key": idempotency } : undefined;
  let path: string;
  let body: unknown;
  if (status === "LOCKED") {
    path = `/v2/cards/${encodeURIComponent(cardId)}/lock`;
    body = {
      reason: optionalString(record, "lock_reason") ?? "OTHER",
      description: optionalString(record, "lock_description"),
    };
  } else if (status === "ACTIVE") {
    path = `/v2/cards/${encodeURIComponent(cardId)}/unlock`;
  } else if (status === "TERMINATED") {
    path = `/v2/cards/${encodeURIComponent(cardId)}/terminate`;
  } else {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "status is not an allowed value" };
  }
  const data = await brexFetch(record, { method: "POST", path, body, headers, success: [200] });
  return envelope("cards.update_status", data);
}

export async function getUserProfile(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  if (typeof record.apiKey !== "string") {
    return { connector: "brex", action: "users.get", source: "connector", validated: record };
  }
  const userId = optionalString(record, "user_id");
  const path = !userId || userId === "me" ? "/v2/users/me" : `/v2/users/${encodeURIComponent(userId)}`;
  const data = await brexFetch(record, { method: "GET", path, success: [200] });
  return envelope("users.get", data);
}

export async function listCashStatements(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  if (typeof record.apiKey !== "string") {
    return { connector: "brex", action: "cash.statements.list", source: "connector", validated: record };
  }
  const primary = await brexFetch(record, { method: "GET", path: "/v2/accounts/cash/primary", success: [200] });
  const id = isRecord(primary) && typeof primary.id === "string" ? primary.id : "";
  if (!id) throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Primary cash account id missing." };
  const data = await brexFetch(record, {
    method: "GET",
    path: `/v2/accounts/cash/${encodeURIComponent(id)}/statements`,
    query: { limit: record.limit, cursor: record.cursor },
    success: [200],
  });
  return envelope("cash.statements.list", data);
}

export async function getTransactionById(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  if (typeof record.apiKey !== "string") {
    return { connector: "brex", action: "transactions.get", source: "connector", validated: record };
  }
  const transactionId = requireString(record, "transaction_id");
  const data = await brexFetch(record, {
    method: "GET",
    path: "/v2/transactions/card/primary",
    query: { limit: record.limit ?? 100, cursor: record.cursor },
    success: [200],
  });
  const match = itemsOf(data).find((item) => isRecord(item) && item.id === transactionId);
  if (!match) throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Transaction was not found in the returned page." };
  return envelope("transactions.get", match);
}

export async function listTransactionsByAmount(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  if (typeof record.apiKey !== "string") {
    return { connector: "brex", action: "transactions.list.by_amount", source: "connector", validated: record };
  }
  const minAmount = record.min_amount;
  const maxAmount = record.max_amount;
  const start = requireString(record, "posted_at_start");
  const end = requireString(record, "posted_at_end");
  if (typeof minAmount !== "number" || typeof maxAmount !== "number") {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "min_amount and max_amount are required." };
  }
  const data = await brexFetch(record, {
    method: "GET",
    path: "/v2/transactions/card/primary",
    query: { limit: record.limit, cursor: record.cursor, posted_at_start: start },
    success: [200],
  });
  const items = itemsOf(data).filter((item) => {
    const amount = usdAmount(item);
    const posted = postedDate(item);
    return amount >= minAmount && amount <= maxAmount && posted >= start && posted <= end;
  });
  return envelope("transactions.list.by_amount", { items, next_cursor: nextCursorOf(data) });
}

export async function listTransactionsByDescription(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  if (typeof record.apiKey !== "string") {
    return { connector: "brex", action: "transactions.list.by_description", source: "connector", validated: record };
  }
  const description = requireString(record, "description").toLowerCase();
  const start = requireString(record, "posted_at_start");
  const end = requireString(record, "posted_at_end");
  const data = await brexFetch(record, {
    method: "GET",
    path: "/v2/transactions/card/primary",
    query: { limit: record.limit, cursor: record.cursor, posted_at_start: start },
    success: [200],
  });
  const items = itemsOf(data).filter((item) => {
    const posted = postedDate(item);
    const text = isRecord(item) && typeof item.description === "string" ? item.description.toLowerCase() : "";
    return text.includes(description) && posted >= start && posted <= end;
  });
  return envelope("transactions.list.by_description", { items, next_cursor: nextCursorOf(data) });
}

export const handwrittenActions = {
  "cards.update_status": updateCardStatus,
  "users.get": getUserProfile,
  "cash.statements.list": listCashStatements,
  "transactions.get": getTransactionById,
  "transactions.list.by_amount": listTransactionsByAmount,
  "transactions.list.by_description": listTransactionsByDescription,
};
