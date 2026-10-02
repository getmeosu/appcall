import { describe, expect, it } from "bun:test";
import {
  sendEmail,
  validateEmailSendInput,
  getEmail,
  listEmails,
  validateEmailGetInput,
  validateEmailListInput,
} from "../src/emails";
import { listDomains, validateDomainsListInput } from "../src/domains";
import { normalizeEmail, normalizeDomain, parseEmailsListResponse, parseDomainsListResponse } from "../src/objects";
import emailGetFixture from "../fixtures/email_get.json";
import emailsListFixture from "../fixtures/emails_list.json";
import domainsListFixture from "../fixtures/domains_list.json";

describe("sendEmail (validated-echo, no apiKey)", () => {
  it("returns the validated payload without apiKey", () => {
    const result = sendEmail({ from: "a@x.com", to: "b@y.com", subject: "Hi", text: "Hello" }) as Record<string, unknown>;
    expect(result.connector).toBe("resend");
    expect(result.action).toBe("emails.send");
    expect(result.source).toBe("connector");
    const validated = result.validated as Record<string, unknown>;
    expect(validated.from).toBe("a@x.com");
    expect(validated.to).toBe("b@y.com");
    expect(validated.subject).toBe("Hi");
    expect(validated.text).toBe("Hello");
  });

  it("accepts an array of recipients", () => {
    const result = sendEmail({ from: "a@x.com", to: ["b@y.com", "c@y.com"], subject: "Hi", html: "<p>Hi</p>" }) as Record<string, unknown>;
    const validated = result.validated as Record<string, unknown>;
    expect(validated.to).toEqual(["b@y.com", "c@y.com"]);
    expect(validated.html).toBe("<p>Hi</p>");
  });

  it("throws when from is missing", () => {
    expect(() => sendEmail({ to: "b@y.com", subject: "Hi" })).toThrow("from is required");
  });

  it("throws when to is missing", () => {
    expect(() => sendEmail({ from: "a@x.com", subject: "Hi" })).toThrow("to is required");
  });

  it("throws when subject is missing", () => {
    expect(() => sendEmail({ from: "a@x.com", to: "b@y.com" })).toThrow("subject is required");
  });

  it("throws when input is not an object", () => {
    expect(() => sendEmail("nope")).toThrow("input must be an object");
  });

  it("validateEmailSendInput carries optional cc/bcc/replyTo", () => {
    const v = validateEmailSendInput({ from: "a@x.com", to: "b@y.com", subject: "Hi", cc: "c@y.com", bcc: ["d@y.com"], replyTo: "r@y.com" });
    expect(v.cc).toBe("c@y.com");
    expect(v.bcc).toEqual(["d@y.com"]);
    expect(v.replyTo).toBe("r@y.com");
  });
});

describe("sendEmail (live call with apiKey, mocked fetch)", () => {
  it("returns {source:provider, id} on 200", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await sendEmail({ apiKey: "re_test", from: "a@x.com", to: "b@y.com", subject: "Hi", html: "<p>Hi</p>", fetch: mockFetch }) as Record<string, unknown>;
    expect(result.connector).toBe("resend");
    expect(result.action).toBe("emails.send");
    expect(result.source).toBe("provider");
    expect(result.id).toBe("49a3999c-0ce1-4ea6-ab68-afcd6dc2e794");
  });

  it("returns {source:provider, id} on 201", async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ id: "abc-123" }), { status: 201, headers: { "Content-Type": "application/json" } });
    };
    const result = await sendEmail({ apiKey: "re_test", from: "a@x.com", to: ["b@y.com"], subject: "Hi", text: "Hi", fetch: mockFetch }) as Record<string, unknown>;
    expect(result.source).toBe("provider");
    expect(result.id).toBe("abc-123");
  });

  it("sends Authorization Bearer header and JSON body to /emails", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      captured = { url: String(input), init };
      return new Response(JSON.stringify({ id: "x" }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await sendEmail({ apiKey: "re_secret", from: "a@x.com", to: "b@y.com", subject: "Hi", text: "Hi", fetch: mockFetch });
    expect(captured?.url).toBe("https://api.resend.com/emails");
    expect(captured?.init?.method).toBe("POST");
    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_secret");
    const sentBody = JSON.parse(String(captured?.init?.body));
    expect(sentBody.from).toBe("a@x.com");
    expect(sentBody.to).toBe("b@y.com");
    expect(sentBody.subject).toBe("Hi");
  });

  it("throws rate limit error on 429", async () => {
    const mockFetch = async (): Promise<Response> => new Response("rate limit", { status: 429, headers: { "retry-after": "25" } });
    try {
      await sendEmail({ apiKey: "re_test", from: "a@x.com", to: "b@y.com", subject: "Hi", text: "Hi", fetch: mockFetch });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(e.retryAfterSeconds).toBe(25);
    }
  });

  it("throws upstream error on 500", async () => {
    const mockFetch = async (): Promise<Response> => new Response("boom", { status: 500, headers: { "Content-Type": "text/plain" } });
    try {
      await sendEmail({ apiKey: "re_test", from: "a@x.com", to: "b@y.com", subject: "Hi", text: "Hi", fetch: mockFetch });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

describe("sendEmail (SMTP relay via injected fake socket)", () => {
  it("returns {source:smtp, accepted} when SMTP credentials are present", async () => {
    const writes: string[] = [];
    const replies = [
      "220 ready",
      "250 AUTH LOGIN",
      "334 user",
      "334 pass",
      "235 ok",
      "250 mail ok",
      "250 rcpt ok",
      "354 data",
      "250 queued",
      "221 bye",
    ];
    let i = 0;
    const __connect = async () => ({
      write: (d: string) => void writes.push(d),
      read: async () => replies[i++],
      upgradeTls: async () => {},
      close: () => {},
    });

    const result = await sendEmail({
      smtpHost: "smtp.example.com",
      smtpPort: "587",
      smtpSecure: true,
      smtpUser: "u",
      smtpPassword: "p",
      from: "a@x.com",
      to: "b@y.com",
      subject: "Hi",
      text: "Hello",
      __connect,
    }) as Record<string, unknown>;

    expect(result.connector).toBe("resend");
    expect(result.action).toBe("emails.send");
    expect(result.source).toBe("smtp");
    expect(result.accepted).toEqual(["b@y.com"]);
    expect(writes.join("")).toContain("MAIL FROM:<a@x.com>\r\n");
  });
});

describe("getEmail", () => {
  it("validated-echo requires id", () => {
    const result = getEmail({ id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" }) as Record<string, unknown>;
    expect(result.action).toBe("emails.get");
    expect(result.source).toBe("connector");
    expect((result.validated as { id: string }).id).toBe("4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
  });

  it("throws when id missing", () => {
    expect(() => validateEmailGetInput({})).toThrow("id is required");
  });

  it("GETs /emails/{id} with Bearer and returns normalized email", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const result = await getEmail({
      apiKey: "re_test",
      id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
      fetch: async (input, init) => {
        captured = { url: String(input), init };
        return Response.json(emailGetFixture, { status: 200 });
      },
    }) as Record<string, any>;

    expect(captured?.url).toBe("https://api.resend.com/emails/4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    expect(captured?.init?.method).toBe("GET");
    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(result.source).toBe("provider");
    expect(result.email.id).toBe("4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    expect(result.email.lastEvent).toBe("delivered");
    expect(result.email.subject).toBe("Hello World");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(
      getEmail({
        apiKey: "re_test",
        id: "missing",
        fetch: async () => new Response("not found", { status: 404 }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(
      getEmail({
        apiKey: "re_test",
        id: "x",
        fetch: async () => new Response("rl", { status: 429, headers: { "retry-after": "12" } }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

describe("listEmails", () => {
  it("validated-echo without apiKey", () => {
    const result = listEmails({ limit: 10 }) as Record<string, unknown>;
    expect(result.action).toBe("emails.list");
    expect(result.source).toBe("connector");
    expect((result.validated as { limit: number }).limit).toBe(10);
  });

  it("rejects after+before together", () => {
    expect(() => validateEmailListInput({ after: "a", before: "b" })).toThrow("after and before cannot both be set");
  });

  it("rejects invalid limit", () => {
    expect(() => validateEmailListInput({ limit: 0 })).toThrow("limit must be between 1 and 100");
    expect(() => validateEmailListInput({ limit: 101 })).toThrow("limit must be between 1 and 100");
  });

  it("GETs /emails with query and returns normalized list", async () => {
    let capturedUrl = "";
    const result = await listEmails({
      apiKey: "re_test",
      limit: 50,
      after: "prev-id",
      fetch: async (input) => {
        capturedUrl = String(input);
        return Response.json(emailsListFixture, { status: 200 });
      },
    }) as Record<string, any>;

    expect(capturedUrl).toBe("https://api.resend.com/emails?limit=50&after=prev-id");
    expect(result.source).toBe("provider");
    expect(result.hasMore).toBe(false);
    expect(result.emails).toHaveLength(2);
    expect(result.emails[0].id).toBe("4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    expect(result.emails[1].lastEvent).toBe("opened");
  });

  it("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(
      listEmails({
        apiKey: "re_test",
        fetch: async () => new Response("boom", { status: 500 }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listDomains", () => {
  it("validated-echo without apiKey", () => {
    const result = listDomains({}) as Record<string, unknown>;
    expect(result.action).toBe("domains.list");
    expect(result.source).toBe("connector");
  });

  it("rejects after+before together", () => {
    expect(() => validateDomainsListInput({ after: "a", before: "b" })).toThrow("after and before cannot both be set");
  });

  it("GETs /domains and returns normalized domains", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const result = await listDomains({
      apiKey: "re_test",
      limit: 20,
      fetch: async (input, init) => {
        captured = { url: String(input), init };
        return Response.json(domainsListFixture, { status: 200 });
      },
    }) as Record<string, any>;

    expect(captured?.url).toBe("https://api.resend.com/domains?limit=20");
    expect(captured?.init?.method).toBe("GET");
    const headers = captured?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(result.source).toBe("provider");
    expect(result.hasMore).toBe(false);
    expect(result.domains).toHaveLength(1);
    expect(result.domains[0].name).toBe("example.com");
    expect(result.domains[0].openTracking).toBe(true);
    expect(result.domains[0].clickTracking).toBe(false);
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(
      listDomains({
        apiKey: "re_test",
        fetch: async () => new Response("rl", { status: 429, headers: { "retry-after": "8" } }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 8 });
  });
});

describe("objects normalizers", () => {
  it("normalizeEmail maps snake_case fields", () => {
    const email = normalizeEmail(emailGetFixture as Record<string, unknown>);
    expect(email.id).toBe("4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    expect(email.lastEvent).toBe("delivered");
    expect(email.createdAt).toContain("2026-04-03");
    expect(email.tags).toEqual([{ name: "category", value: "confirm_email" }]);
  });

  it("parseEmailsListResponse reads data + has_more", () => {
    const parsed = parseEmailsListResponse(emailsListFixture);
    expect(parsed.emails).toHaveLength(2);
    expect(parsed.hasMore).toBe(false);
  });

  it("normalizeDomain + parseDomainsListResponse", () => {
    const domain = normalizeDomain((domainsListFixture as any).data[0]);
    expect(domain.name).toBe("example.com");
    expect(domain.region).toBe("us-east-1");
    const parsed = parseDomainsListResponse(domainsListFixture);
    expect(parsed.domains[0].id).toBe(domain.id);
  });
});
