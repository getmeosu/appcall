import { describe, expect, it } from "bun:test";
import { sendEmail, validateEmailSendInput } from "../src/emails";

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
