import { describe, expect, it } from "bun:test";
import {
  sendSmtpEmail,
  verifySmtp,
  buildMessage,
  isSmtpConfigured,
  type SmtpConnect,
  type SmtpSocket,
} from "../smtp";

// ─── Fake socket ─────────────────────────────────────────────────────────────
//
// Scripts a sequence of server replies. Each call to read() returns the next
// scripted reply. Every write() is recorded for assertions.

function makeFakeConnect(replies: string[]): { connect: SmtpConnect; writes: string[]; closed: () => boolean } {
  const writes: string[] = [];
  let isClosed = false;
  let i = 0;
  const connect: SmtpConnect = async () => {
    const socket: SmtpSocket = {
      write(data: string) {
        writes.push(data);
      },
      async read() {
        if (i >= replies.length) throw new Error("no more scripted replies");
        return replies[i++];
      },
      async upgradeTls() {
        /* no-op for fake */
      },
      close() {
        isClosed = true;
      },
    };
    return socket;
  };
  return { connect, writes, closed: () => isClosed };
}

const baseInput = {
  smtpHost: "smtp.example.com",
  smtpPort: "587",
  smtpSecure: true,
  smtpUser: "relay-user",
  smtpPassword: "relay-pass",
  from: "Sender <sender@example.com>",
  to: "recipient@example.com",
  subject: "Hello World",
  text: "Plain body",
};

describe("sendSmtpEmail (scripted fake socket)", () => {
  it("walks the full conversation and returns accepted recipients", async () => {
    const { connect, writes } = makeFakeConnect([
      "220 smtp.example.com ESMTP ready",
      "250-smtp.example.com\r\n250 AUTH LOGIN", // EHLO
      "334 VXNlcm5hbWU6", // AUTH LOGIN
      "334 UGFzc3dvcmQ6", // username
      "235 2.7.0 Authentication successful", // password
      "250 2.1.0 Ok", // MAIL FROM
      "250 2.1.5 Ok", // RCPT TO
      "354 End data with <CR><LF>.<CR><LF>", // DATA
      "250 2.0.0 Ok: queued", // message body
      "221 2.0.0 Bye", // QUIT
    ]);

    const result = await sendSmtpEmail(baseInput, { connect });

    expect(result.accepted).toEqual(["recipient@example.com"]);
    expect(typeof result.messageId).toBe("string");

    const joined = writes.join("");
    expect(joined).toContain("EHLO appcall\r\n");
    expect(joined).toContain("AUTH LOGIN\r\n");
    // base64 of user/pass
    expect(joined).toContain(Buffer.from("relay-user").toString("base64") + "\r\n");
    expect(joined).toContain(Buffer.from("relay-pass").toString("base64") + "\r\n");
    expect(joined).toContain("MAIL FROM:<sender@example.com>\r\n");
    expect(joined).toContain("RCPT TO:<recipient@example.com>\r\n");
    expect(joined).toContain("Subject: Hello World");
    expect(joined).toContain("Plain body");
    expect(joined).toContain("\r\n.\r\n");
    expect(joined).toContain("QUIT\r\n");
  });

  it("sends RCPT TO for every recipient including cc/bcc", async () => {
    const { connect, writes } = makeFakeConnect([
      "220 ready",
      "250 AUTH LOGIN",
      "334 user",
      "334 pass",
      "235 ok",
      "250 mail ok",
      "250 rcpt1",
      "250 rcpt2",
      "250 rcpt3",
      "354 data",
      "250 queued",
      "221 bye",
    ]);

    const result = await sendSmtpEmail(
      {
        ...baseInput,
        to: ["a@example.com"],
        cc: "b@example.com",
        bcc: ["c@example.com"],
      },
      { connect },
    );

    expect(result.accepted).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    const joined = writes.join("");
    expect(joined).toContain("RCPT TO:<a@example.com>\r\n");
    expect(joined).toContain("RCPT TO:<b@example.com>\r\n");
    expect(joined).toContain("RCPT TO:<c@example.com>\r\n");
    // bcc must NOT appear in the visible headers
    expect(joined).not.toContain("Bcc:");
  });

  it("performs STARTTLS upgrade when advertised on a plaintext port", async () => {
    let upgraded = false;
    const writes: string[] = [];
    const connect: SmtpConnect = async () => {
      const replies = [
        "220 ready",
        "250-smtp\r\n250 STARTTLS", // EHLO #1
        "220 Go ahead", // STARTTLS
        "250-smtp\r\n250 AUTH LOGIN", // EHLO #2
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
      return {
        write: (d: string) => void writes.push(d),
        read: async () => replies[i++],
        upgradeTls: async () => {
          upgraded = true;
        },
        close: () => {},
      };
    };

    await sendSmtpEmail({ ...baseInput, smtpSecure: false }, { connect });
    expect(upgraded).toBe(true);
    const joined = writes.join("");
    expect(joined).toContain("STARTTLS\r\n");
    // EHLO issued twice (before and after upgrade)
    expect(joined.match(/EHLO appcall\r\n/g)?.length).toBe(2);
  });

  it("throws structured CONNECTOR_UPSTREAM_ERROR on 535 auth failure", async () => {
    const { connect } = makeFakeConnect([
      "220 ready",
      "250 AUTH LOGIN",
      "334 user",
      "334 pass",
      "535 5.7.8 Authentication credentials invalid",
    ]);

    await expect(sendSmtpEmail(baseInput, { connect })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "SMTP relay rejected the message.",
    });
  });

  it("throws CONNECTOR_UNAVAILABLE when the socket factory cannot connect", async () => {
    const connect: SmtpConnect = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(sendSmtpEmail(baseInput, { connect })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UNAVAILABLE",
    });
  });

  it("supports the test-only __connect injection path", async () => {
    const { connect, writes } = makeFakeConnect([
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
    ]);
    const result = await sendSmtpEmail({ ...baseInput, __connect: connect });
    expect(result.accepted).toEqual(["recipient@example.com"]);
    expect(writes.join("")).toContain("MAIL FROM:<sender@example.com>\r\n");
  });
});

describe("verifySmtp (scripted fake socket, AUTH only — no mail sent)", () => {
  it("returns { ok:true } on 235 auth-accepted and sends QUIT without DATA", async () => {
    const { connect, writes } = makeFakeConnect([
      "220 smtp.example.com ESMTP ready", // greeting
      "250-smtp.example.com\r\n250 AUTH LOGIN", // EHLO
      "334 VXNlcm5hbWU6", // AUTH LOGIN
      "334 UGFzc3dvcmQ6", // username
      "235 2.7.0 Authentication successful", // password
      "221 2.0.0 Bye", // QUIT
    ]);

    const result = await verifySmtp(baseInput, { connect });
    expect(result).toEqual({ ok: true });

    const joined = writes.join("");
    expect(joined).toContain("EHLO appcall\r\n");
    expect(joined).toContain("AUTH LOGIN\r\n");
    expect(joined).toContain(Buffer.from("relay-user").toString("base64") + "\r\n");
    expect(joined).toContain(Buffer.from("relay-pass").toString("base64") + "\r\n");
    expect(joined).toContain("QUIT\r\n");
    // Credential verification must NOT run the mail transaction.
    expect(joined).not.toContain("MAIL FROM");
    expect(joined).not.toContain("RCPT TO");
    expect(joined).not.toContain("DATA");
  });

  it("throws CONNECTOR_UPSTREAM_ERROR on 535 auth failure", async () => {
    const { connect, writes } = makeFakeConnect([
      "220 ready",
      "250 AUTH LOGIN",
      "334 user",
      "334 pass",
      "535 5.7.8 Authentication credentials invalid",
    ]);

    await expect(verifySmtp(baseInput, { connect })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    const joined = writes.join("");
    expect(joined).not.toContain("DATA");
  });

  it("throws CONNECTOR_UNAVAILABLE when the socket factory cannot connect", async () => {
    const connect: SmtpConnect = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(verifySmtp(baseInput, { connect })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UNAVAILABLE",
    });
  });
});

describe("buildMessage", () => {
  it("renders RFC 5322 headers", () => {
    const msg = buildMessage({
      from: "sender@example.com",
      to: ["a@example.com", "b@example.com"],
      cc: "c@example.com",
      subject: "Test Subject",
      text: "Body",
      messageId: "<fixed@example.com>",
      date: "Mon, 01 Jan 2026 00:00:00 GMT",
    });
    expect(msg).toContain("From: sender@example.com\r\n");
    expect(msg).toContain("To: a@example.com, b@example.com\r\n");
    expect(msg).toContain("Cc: c@example.com\r\n");
    expect(msg).toContain("Subject: Test Subject\r\n");
    expect(msg).toContain("Message-ID: <fixed@example.com>\r\n");
    expect(msg).toContain("MIME-Version: 1.0\r\n");
    expect(msg).toContain("Date: Mon, 01 Jan 2026 00:00:00 GMT\r\n");
  });

  it("produces multipart/alternative when both text and html present", () => {
    const msg = buildMessage({
      from: "s@example.com",
      to: "r@example.com",
      subject: "Hi",
      text: "plain version",
      html: "<p>html version</p>",
    });
    expect(msg).toContain("Content-Type: multipart/alternative; boundary=");
    expect(msg).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(msg).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(msg).toContain("plain version");
    expect(msg).toContain("<p>html version</p>");
  });

  it("uses text/html when only html present", () => {
    const msg = buildMessage({ from: "s@e.com", to: "r@e.com", subject: "Hi", html: "<b>x</b>" });
    expect(msg).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(msg).not.toContain("multipart/alternative");
  });

  it("dot-stuffs lines that begin with a period", () => {
    const msg = buildMessage({
      from: "s@e.com",
      to: "r@e.com",
      subject: "Hi",
      text: "normal line\n.dangerous line\n..two dots",
    });
    expect(msg).toContain("\r\n..dangerous line\r\n");
    expect(msg).toContain("\r\n...two dots");
  });

  it("RFC 2047 encodes non-ASCII subjects", () => {
    const msg = buildMessage({ from: "s@e.com", to: "r@e.com", subject: "Héllo ☃", text: "x" });
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  });
});

describe("isSmtpConfigured", () => {
  it("true when smtpHost is a non-empty string", () => {
    expect(isSmtpConfigured({ smtpHost: "smtp.example.com" })).toBe(true);
  });
  it("false when smtpHost is missing", () => {
    expect(isSmtpConfigured({ apiKey: "x" })).toBe(false);
  });
  it("false when smtpHost is empty", () => {
    expect(isSmtpConfigured({ smtpHost: "" })).toBe(false);
  });
  it("false for non-object input", () => {
    expect(isSmtpConfigured(null)).toBe(false);
    expect(isSmtpConfigured("nope")).toBe(false);
    expect(isSmtpConfigured(undefined)).toBe(false);
  });
});
