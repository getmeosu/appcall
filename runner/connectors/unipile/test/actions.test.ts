import { describe, expect, test } from "bun:test";

import accountsListFixture from "../fixtures/accounts_list.json";
import accountGetFixture from "../fixtures/account_get.json";
import chatsListFixture from "../fixtures/chats_list.json";
import chatGetFixture from "../fixtures/chat_get.json";
import messagesListFixture from "../fixtures/messages_list.json";
import messageSendFixture from "../fixtures/message_send.json";
import chatStartFixture from "../fixtures/chat_start.json";
import emailsListFixture from "../fixtures/emails_list.json";
import emailGetFixture from "../fixtures/email_get.json";
import emailSendFixture from "../fixtures/email_send.json";
import linkedInProfileFixture from "../fixtures/linkedin_profile.json";
import linkedInInvitationFixture from "../fixtures/linkedin_invitation.json";
import linkedInRelationsFixture from "../fixtures/linkedin_relations.json";

import {
  listAccounts,
  getAccount,
  listChats,
  getChat,
  listMessages,
  sendMessage,
  startChat,
  listEmails,
  getEmail,
  sendEmail,
  getLinkedInProfile,
  sendLinkedInInvitation,
  listLinkedInRelations,
  validateAccountsListInput,
  validateAccountsGetInput,
  validateChatsListInput,
  validateChatsGetInput,
  validateMessagesListInput,
  validateMessagesSendInput,
  validateChatsStartInput,
  validateEmailsListInput,
  validateEmailsGetInput,
  validateEmailsSendInput,
  validateLinkedInProfileGetInput,
  validateLinkedInInvitationSendInput,
  validateLinkedInRelationsListInput,
} from "../src/actions";

const BASE_DSN = "https://api8.unipile.com:13851";
const API_KEY = "test_api_key";

// ─── accounts.list ────────────────────────────────────────────────────────────

describe("listAccounts", () => {
  test("returns validated output in validation mode (no credentials)", () => {
    // Dual-mode: no apiKey in input → validation branch
    const result = listAccounts({});
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("unipile");
    expect(result.action).toBe("accounts.list");
  });

  test("throws when apiKey is missing in validate", () => {
    expect(() => validateAccountsListInput({ dsn: BASE_DSN })).toThrow("apiKey is required");
  });

  test("throws when dsn is missing in validate", () => {
    expect(() => validateAccountsListInput({ apiKey: API_KEY })).toThrow("dsn is required");
  });

  test("calls GET /api/v1/accounts with X-API-KEY header", async () => {
    const requests: Request[] = [];
    const result = await listAccounts({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(accountsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.hostname).toBe("api8.unipile.com");
    expect(url.pathname).toBe("/api/v1/accounts");
    expect(requests[0].headers.get("X-API-KEY")).toBe(API_KEY);
    expect(result.connector).toBe("unipile");
    expect(result.action).toBe("accounts.list");
    expect(result.source).toBe("connector");
    expect(Array.isArray(result.accounts)).toBe(true);
    expect((result.accounts as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listAccounts({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps non-200 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listAccounts({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── accounts.get ─────────────────────────────────────────────────────────────

describe("getAccount", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = getAccount({ accountId: "acc_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("accounts.get");
  });

  test("throws when accountId is missing in validate", () => {
    expect(() => validateAccountsGetInput({ apiKey: API_KEY, dsn: BASE_DSN })).toThrow("accountId is required");
  });

  test("calls GET /api/v1/accounts/{accountId}", async () => {
    const requests: Request[] = [];
    const result = await getAccount({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      accountId: "acc_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(accountGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/accounts/acc_001");
    expect(result.action).toBe("accounts.get");
    expect(result.account).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getAccount({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      accountId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getAccount({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      accountId: "acc_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── chats.list ───────────────────────────────────────────────────────────────

describe("listChats", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = listChats({ account_id: "acc_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("chats.list");
  });

  test("calls GET /api/v1/chats with account_id, limit, cursor params", async () => {
    const requests: Request[] = [];
    const result = await listChats({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      limit: 10,
      cursor: "cursor_abc",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(chatsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/chats");
    expect(url.searchParams.get("account_id")).toBe("acc_001");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("cursor")).toBe("cursor_abc");
    expect(result.action).toBe("chats.list");
    expect(Array.isArray(result.chats)).toBe(true);
    expect((result.chats as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listChats({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

// ─── chats.get ────────────────────────────────────────────────────────────────

describe("getChat", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = getChat({ chatId: "chat_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("chats.get");
  });

  test("throws when chatId is missing in validate", () => {
    expect(() => validateChatsGetInput({ apiKey: API_KEY, dsn: BASE_DSN })).toThrow("chatId is required");
  });

  test("calls GET /api/v1/chats/{chatId}", async () => {
    const requests: Request[] = [];
    const result = await getChat({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      chatId: "chat_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(chatGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/chats/chat_001");
    expect(result.action).toBe("chats.get");
    expect(result.chat).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getChat({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      chatId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── messages.list ────────────────────────────────────────────────────────────

describe("listMessages", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = listMessages({ chatId: "chat_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("messages.list");
  });

  test("throws when chatId is missing in validate", () => {
    expect(() => validateMessagesListInput({ apiKey: API_KEY, dsn: BASE_DSN })).toThrow("chatId is required");
  });

  test("calls GET /api/v1/chats/{chatId}/messages with limit and cursor", async () => {
    const requests: Request[] = [];
    const result = await listMessages({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      chatId: "chat_001",
      limit: 20,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(messagesListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/chats/chat_001/messages");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(result.action).toBe("messages.list");
    expect(Array.isArray(result.messages)).toBe(true);
    expect((result.messages as unknown[]).length).toBe(2);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listMessages({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      chatId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listMessages({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      chatId: "chat_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 10 });
  });
});

// ─── messages.send ────────────────────────────────────────────────────────────

describe("sendMessage", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = sendMessage({ chatId: "chat_001", text: "Hello!" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("messages.send");
  });

  test("throws when text is missing in validate", () => {
    expect(() => validateMessagesSendInput({ apiKey: API_KEY, dsn: BASE_DSN, chatId: "chat_001" })).toThrow("text is required");
  });

  test("calls POST /api/v1/chats/{chatId}/messages with body { text }", async () => {
    const requests: Request[] = [];
    const result = await sendMessage({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      chatId: "chat_001",
      text: "Hello there!",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(messageSendFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/chats/chat_001/messages");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.text).toBe("Hello there!");
    expect(result.action).toBe("messages.send");
    expect(result.message).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(sendMessage({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      chatId: "chat_001",
      text: "hi",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── chats.start ──────────────────────────────────────────────────────────────

describe("startChat", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = startChat({ account_id: "acc_001", attendees_ids: ["ACoAAJane123"] });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("chats.start");
  });

  test("throws when attendees_ids is empty", () => {
    expect(() => validateChatsStartInput({ apiKey: API_KEY, dsn: BASE_DSN, account_id: "acc_001", attendees_ids: [] })).toThrow("attendees_ids must be a non-empty array");
  });

  test("calls POST /api/v1/chats with body including account_id, attendees_ids, text", async () => {
    const requests: Request[] = [];
    const result = await startChat({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      attendees_ids: ["ACoAAJane123"],
      text: "Hey, let's connect!",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(chatStartFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/chats");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.account_id).toBe("acc_001");
    expect(body.attendees_ids).toEqual(["ACoAAJane123"]);
    expect(body.text).toBe("Hey, let's connect!");
    expect(result.action).toBe("chats.start");
    expect(result.chat).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(startChat({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      attendees_ids: ["prov_001"],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── emails.list ──────────────────────────────────────────────────────────────

describe("listEmails", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = listEmails({ account_id: "acc_002" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("emails.list");
  });

  test("calls GET /api/v1/emails with account_id and limit", async () => {
    const requests: Request[] = [];
    const result = await listEmails({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_002",
      limit: 5,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(emailsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/emails");
    expect(url.searchParams.get("account_id")).toBe("acc_002");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(result.action).toBe("emails.list");
    expect(Array.isArray(result.emails)).toBe(true);
    expect((result.emails as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listEmails({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── emails.get ───────────────────────────────────────────────────────────────

describe("getEmail", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = getEmail({ emailId: "email_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("emails.get");
  });

  test("throws when emailId is missing in validate", () => {
    expect(() => validateEmailsGetInput({ apiKey: API_KEY, dsn: BASE_DSN })).toThrow("emailId is required");
  });

  test("calls GET /api/v1/emails/{emailId}", async () => {
    const requests: Request[] = [];
    const result = await getEmail({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      emailId: "email_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(emailGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/emails/email_001");
    expect(result.action).toBe("emails.get");
    expect(result.email).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getEmail({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      emailId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── emails.send ──────────────────────────────────────────────────────────────

describe("sendEmail", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = sendEmail({
      account_id: "acc_002",
      to: [{ identifier: "jane@example.com" }],
      subject: "Hello",
      body: "<p>Hi!</p>",
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("emails.send");
  });

  test("throws when to array is empty", () => {
    expect(() => validateEmailsSendInput({ apiKey: API_KEY, dsn: BASE_DSN, account_id: "acc_002", to: [], subject: "Hi", body: "text" })).toThrow("to must be a non-empty array");
  });

  test("calls POST /api/v1/emails with full payload", async () => {
    const requests: Request[] = [];
    const result = await sendEmail({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_002",
      to: [{ identifier: "jane@example.com" }],
      subject: "Follow-up",
      body: "<p>Just following up.</p>",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(emailSendFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/emails");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.account_id).toBe("acc_002");
    expect(body.to).toEqual([{ identifier: "jane@example.com" }]);
    expect(body.subject).toBe("Follow-up");
    expect(result.action).toBe("emails.send");
    expect(result.email).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(sendEmail({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_002",
      to: [{ identifier: "x@y.com" }],
      subject: "s",
      body: "b",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── linkedin.profile.get ─────────────────────────────────────────────────────

describe("getLinkedInProfile", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = getLinkedInProfile({ identifier: "janesmith", account_id: "acc_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("linkedin.profile.get");
  });

  test("throws when identifier is missing in validate", () => {
    expect(() => validateLinkedInProfileGetInput({ apiKey: API_KEY, dsn: BASE_DSN, account_id: "acc_001" })).toThrow("identifier is required");
  });

  test("calls GET /api/v1/users/{identifier}?account_id=", async () => {
    const requests: Request[] = [];
    const result = await getLinkedInProfile({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      identifier: "ACoAAJane123",
      account_id: "acc_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(linkedInProfileFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/users/ACoAAJane123");
    expect(url.searchParams.get("account_id")).toBe("acc_001");
    expect(result.action).toBe("linkedin.profile.get");
    expect(result.profile).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getLinkedInProfile({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      identifier: "nonexistent",
      account_id: "acc_001",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getLinkedInProfile({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      identifier: "someone",
      account_id: "acc_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── linkedin.invitation.send ─────────────────────────────────────────────────

describe("sendLinkedInInvitation", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = sendLinkedInInvitation({ account_id: "acc_001", provider_id: "ACoAABobXYZ" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("linkedin.invitation.send");
  });

  test("throws when provider_id is missing in validate", () => {
    expect(() => validateLinkedInInvitationSendInput({ apiKey: API_KEY, dsn: BASE_DSN, account_id: "acc_001" })).toThrow("provider_id is required");
  });

  test("calls POST /api/v1/users/invite with account_id and provider_id", async () => {
    const requests: Request[] = [];
    const result = await sendLinkedInInvitation({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      message: "Let's connect!",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(linkedInInvitationFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/users/invite");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.account_id).toBe("acc_001");
    expect(body.provider_id).toBe("ACoAABobXYZ");
    expect(body.message).toBe("Let's connect!");
    expect(result.action).toBe("linkedin.invitation.send");
    expect(result.invitation).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(sendLinkedInInvitation({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  // Tier-aware note ceiling: LinkedIn caps connection notes at 200 chars on
  // FREE accounts and 300 on Premium. A 201–300 note triggers ONE live
  // accounts.get to verify Premium before dispatch; free / unverifiable
  // accounts fail closed as NOTE_TOO_LONG (never over/underdraft either tier).
  const freeAccount = {
    object: "Account", id: "acc_001", type: "LINKEDIN",
    connection_params: { im: { id: "ACoAA_self", premiumId: null, premiumFeatures: [], premiumContractId: null } },
  };
  const premiumAccount = {
    object: "Account", id: "acc_001", type: "LINKEDIN",
    connection_params: { im: { id: "ACoAA_self", premiumId: "prem_1", premiumFeatures: ["sales_navigator"], premiumContractId: "contract_1" } },
  };
  const tierFetch = (account: unknown, requests: Request[]) => async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    requests.push(req);
    const path = new URL(req.url).pathname;
    if (path === "/api/v1/accounts/acc_001") return new Response(JSON.stringify(account), { status: 200 });
    if (path === "/api/v1/users/invite") return new Response(JSON.stringify(linkedInInvitationFixture), { status: 201 });
    return new Response("{}", { status: 404 });
  };

  test("rejects a 201+ note on a FREE account (NOTE_TOO_LONG) without dispatching the invite", async () => {
    const requests: Request[] = [];
    await expect(sendLinkedInInvitation({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      message: "x".repeat(250),
      fetch: tierFetch(freeAccount, requests),
    })).rejects.toMatchObject({ ok: false, code: "NOTE_TOO_LONG" });
    expect(requests.some((r) => new URL(r.url).pathname === "/api/v1/users/invite")).toBe(false);
  });

  test("allows a 201–300 note on a PREMIUM account (one accounts.get, then dispatch)", async () => {
    const requests: Request[] = [];
    const result = await sendLinkedInInvitation({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      message: "x".repeat(250),
      fetch: tierFetch(premiumAccount, requests),
    });
    expect(result.invitation).toBeDefined();
    const paths = requests.map((r) => new URL(r.url).pathname);
    expect(paths).toEqual(["/api/v1/accounts/acc_001", "/api/v1/users/invite"]);
    const body = await requests[1].json() as Record<string, unknown>;
    expect((body.message as string).length).toBe(250);
  });

  test("rejects a 300+ note even on PREMIUM (absolute LinkedIn ceiling) without any fetch", async () => {
    const requests: Request[] = [];
    await expect(Promise.resolve().then(() => sendLinkedInInvitation({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      message: "x".repeat(301),
      fetch: tierFetch(premiumAccount, requests),
    }))).rejects.toMatchObject({ ok: false, code: "NOTE_TOO_LONG" });
    expect(requests).toHaveLength(0);
  });

  test("fails CLOSED on a 201+ note when the account lookup fails (cannot verify Premium)", async () => {
    const requests: Request[] = [];
    await expect(sendLinkedInInvitation({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      message: "x".repeat(250),
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init);
        requests.push(req);
        if (new URL(req.url).pathname === "/api/v1/users/invite") return new Response(JSON.stringify(linkedInInvitationFixture), { status: 201 });
        return new Response("{}", { status: 500 });
      },
    })).rejects.toMatchObject({ ok: false, code: "NOTE_TOO_LONG" });
    expect(requests.some((r) => new URL(r.url).pathname === "/api/v1/users/invite")).toBe(false);
  });

  test("accepts a connection note at exactly the 200-char free limit with NO tier lookup", async () => {
    const requests: Request[] = [];
    const result = await sendLinkedInInvitation({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      message: "x".repeat(200),
      fetch: tierFetch(freeAccount, requests),
    });
    expect(result.action).toBe("linkedin.invitation.send");
    expect(result.invitation).toBeDefined();
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(["/api/v1/users/invite"]);
  });

  test("validate (no credentials) allows up to 300 and rejects above it", () => {
    expect(() => validateLinkedInInvitationSendInput({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      message: "x".repeat(250),
    })).not.toThrow();
    expect(() => validateLinkedInInvitationSendInput({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      provider_id: "ACoAABobXYZ",
      message: "x".repeat(301),
    })).toThrow(/300/);
  });
});

// ─── linkedin.relations.list ──────────────────────────────────────────────────

describe("listLinkedInRelations", () => {
  test("returns validated in validation mode (no credentials)", () => {
    const result = listLinkedInRelations({ account_id: "acc_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("linkedin.relations.list");
  });

  test("throws when account_id is missing in validate", () => {
    expect(() => validateLinkedInRelationsListInput({ apiKey: API_KEY, dsn: BASE_DSN })).toThrow("account_id is required");
  });

  test("calls GET /api/v1/users/relations?account_id= with limit and cursor", async () => {
    const requests: Request[] = [];
    const result = await listLinkedInRelations({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      limit: 50,
      cursor: "rel_cursor_xyz",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(linkedInRelationsFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/users/relations");
    expect(url.searchParams.get("account_id")).toBe("acc_001");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("cursor")).toBe("rel_cursor_xyz");
    expect(result.action).toBe("linkedin.relations.list");
    expect(Array.isArray(result.relations)).toBe(true);
    expect((result.relations as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listLinkedInRelations({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "acc_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── server-injected account_id ────────────────────────────────────────────────
// account_id is removed from the agent-facing manifest schema (see manifest.test.ts).
// At dispatch time, appcall injects the resolved account_id into the input alongside
// apiKey/dsn. These tests confirm the connector still reads the INJECTED account_id
// and forwards it to Unipile for account-scoped actions.

describe("account_id is consumed from injected input (not agent-supplied)", () => {
  test("emails.send forwards the injected account_id in the request body", async () => {
    const requests: Request[] = [];
    await sendEmail({
      // apiKey/dsn/account_id all arrive via server-side injection
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "injected_acc_mail",
      to: [{ identifier: "jane@example.com" }],
      subject: "Hi",
      body: "<p>hi</p>",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(emailSendFixture), { status: 201 });
      },
    });
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.account_id).toBe("injected_acc_mail");
  });

  test("linkedin.invitation.send forwards the injected account_id in the request body", async () => {
    const requests: Request[] = [];
    await sendLinkedInInvitation({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "injected_acc_li",
      provider_id: "ACoAABobXYZ",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(linkedInInvitationFixture), { status: 201 });
      },
    });
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.account_id).toBe("injected_acc_li");
  });

  test("linkedin.profile.get forwards the injected account_id as a query param", async () => {
    const requests: Request[] = [];
    await getLinkedInProfile({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      identifier: "ACoAAJane123",
      account_id: "injected_acc_li",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(linkedInProfileFixture), { status: 200 });
      },
    });
    expect(new URL(requests[0].url).searchParams.get("account_id")).toBe("injected_acc_li");
  });

  test("chats.start forwards the injected account_id in the request body", async () => {
    const requests: Request[] = [];
    await startChat({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "injected_acc_msg",
      attendees_ids: ["ACoAAJane123"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(chatStartFixture), { status: 201 });
      },
    });
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.account_id).toBe("injected_acc_msg");
  });

  test("emails.list and chats.list treat account_id as optional (no injection -> no scoping param)", () => {
    // When the resolved channel is empty, appcall performs no injection; the
    // connector must still operate without an account_id (workspace-scoped read).
    const emails = validateEmailsListInput({ apiKey: API_KEY, dsn: BASE_DSN });
    expect(emails.account_id).toBeUndefined();
    const chats = validateChatsListInput({ apiKey: API_KEY, dsn: BASE_DSN });
    expect(chats.account_id).toBeUndefined();
  });

  test("emails.list forwards an injected account_id when present", async () => {
    const requests: Request[] = [];
    await listEmails({
      apiKey: API_KEY,
      dsn: BASE_DSN,
      account_id: "injected_acc_mail",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(emailsListFixture), { status: 200 });
      },
    });
    expect(new URL(requests[0].url).searchParams.get("account_id")).toBe("injected_acc_mail");
  });
});
