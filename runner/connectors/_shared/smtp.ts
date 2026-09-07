import { executionContext, timeoutError } from "../../bun/src/execution";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
// ─── Shared SMTP relay client ─────────────────────────────────────────────────
//
// Sends mail over a raw SMTP conversation using only the runtime's native TCP/TLS
// sockets (Bun.connect). No external npm packages, no vendor SDKs.
//
// Conversation (per RFC 5321 / 5322):
//   greeting (220) → EHLO → [STARTTLS (220) → EHLO] → AUTH LOGIN (235)
//     → MAIL FROM:<from> (250) → RCPT TO:<rcpt> (250, per recipient)
//     → DATA (354) → message + CRLF "." CRLF (250) → QUIT (221)
//
// Reply codes: a 3-digit code begins each reply line. A line with "<code>-" is a
// continuation; "<code> " (space) terminates the multiline reply. We treat 2xx/3xx
// as success for a step and throw a structured error otherwise.
//
// Testability: the SMTP logic talks to an abstract `SmtpSocket` (write/read/close
// + upgradeTls). The default factory wraps Bun.connect; unit tests pass a fake
// socket that scripts the server replies, so no real network is required. Tests may
// also inject the factory via `input.__connect` (test-only escape hatch).

// ─── Public input/option types ────────────────────────────────────────────────

export interface SmtpInput {
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpUser?: unknown;
  smtpPassword?: unknown;
  smtpSecure?: unknown;
  from?: unknown;
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  replyTo?: unknown;
  /** Test-only injectable socket factory. */
  __connect?: SmtpConnect;
  [key: string]: unknown;
}

/** Minimal duplex SMTP socket the conversation drives. */
export interface SmtpSocket {
  /** Write raw bytes (already CRLF-terminated where the protocol requires it). */
  write(data: string): void | Promise<void>;
  /** Resolve with the next complete server reply (one full, possibly multiline, reply). */
  read(): Promise<string>;
  /** Upgrade a plaintext connection to TLS in place (STARTTLS). */
  upgradeTls?(): Promise<void>;
  /** Close the socket. */
  close(): void | Promise<void>;
}

export interface SmtpConnectParams {
  signal?: AbortSignal;
  host: string;
  port: number;
  /** true → implicit TLS from the first byte (port 465 style). */
  tls: boolean;
}

export type SmtpConnect = (params: SmtpConnectParams) => Promise<SmtpSocket>;

export interface SendSmtpOptions {
  connect?: SmtpConnect;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SmtpResult {
  messageId?: string;
  accepted: string[];
}

export interface StructuredError {
  ok: false;
  code: "CONNECTOR_UPSTREAM_ERROR" | "CONNECTOR_UNAVAILABLE" | "OPERATION_TIMEOUT";
  message: string;
}

// ─── Config detection ──────────────────────────────────────────────────────────

export function isSmtpConfigured(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    !(typeof (input as any).apiKey === "string" && (input as any).apiKey.length > 0) &&
    typeof (input as { smtpHost?: unknown }).smtpHost === "string" &&
    (input as { smtpHost: string }).smtpHost.length > 0
  );
}

// ─── Errors ──────────────────────────────────────────────────────────────────

function upstreamError(): StructuredError {
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "SMTP relay rejected the message." };
}

function unavailableError(): StructuredError {
  return { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "SMTP relay connection failed." };
}

// ─── Recipients / address normalization ────────────────────────────────────────

function toAddressList(v: unknown): string[] {
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? [s] : [];
  }
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  }
  return [];
}

/** Extract the bare addr-spec (`local@domain`) from a possibly display-name address. */
function bareAddress(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim();
}

// ─── Reply parsing ──────────────────────────────────────────────────────────────

function replyCode(reply: string): number {
  // First line of the reply carries the authoritative 3-digit code.
  const first = reply.split(/\r?\n/, 1)[0] ?? "";
  const code = parseInt(first.slice(0, 3), 10);
  return Number.isNaN(code) ? 0 : code;
}

function isPositive(code: number): boolean {
  return code >= 200 && code < 400; // 2xx completion + 3xx intermediate
}

// ─── Message building (RFC 5322) ────────────────────────────────────────────────

export interface BuildMessageInput {
  from: string;
  to: string | string[];
  cc?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  replyTo?: string | string[];
  messageId?: string;
  date?: string;
}

/** Encode a header value that may contain non-ASCII using RFC 2047 (B encoding). */
function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const b64 = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

/** Dot-stuff per RFC 5321 §4.5.2: any line beginning with '.' gets an extra leading '.'. */
function dotStuff(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => (line.startsWith(".") ? "." + line : line))
    .join("\r\n");
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r?\n/g, "\r\n");
}

export function buildMessage(input: BuildMessageInput): string {
  validateHeaders(input as unknown as Record<string, unknown>);
  const toList = toAddressList(input.to);
  const ccList = toAddressList(input.cc);
  const replyToList = toAddressList(input.replyTo);

  const headers: string[] = [];
  headers.push(`From: ${input.from}`);
  if (toList.length) headers.push(`To: ${toList.join(", ")}`);
  if (ccList.length) headers.push(`Cc: ${ccList.join(", ")}`);
  if (replyToList.length) headers.push(`Reply-To: ${replyToList.join(", ")}`);
  headers.push(`Subject: ${encodeHeaderWord(input.subject ?? "")}`);
  headers.push(`Date: ${input.date ?? new Date().toUTCString()}`);
  headers.push(`Message-ID: ${input.messageId ?? defaultMessageId(input.from)}`);
  headers.push("MIME-Version: 1.0");

  const text = input.text;
  const html = input.html;

  let body: string;
  let contentHeaders: string[];

  if (typeof text === "string" && text.length > 0 && typeof html === "string" && html.length > 0) {
    // multipart/alternative
    const boundary = `=_appcall_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    contentHeaders = [`Content-Type: multipart/alternative; boundary="${boundary}"`];
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      normalizeNewlines(text),
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      normalizeNewlines(html),
      `--${boundary}--`,
      "",
    ];
    body = parts.join("\r\n");
  } else if (typeof html === "string" && html.length > 0) {
    contentHeaders = ['Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: 8bit"];
    body = normalizeNewlines(html);
  } else {
    contentHeaders = ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit"];
    body = normalizeNewlines(typeof text === "string" ? text : "");
  }

  const head = [...headers, ...contentHeaders].join("\r\n");
  return `${head}\r\n\r\n${dotStuff(body)}`;
}

function defaultMessageId(from: string): string {
  const domain = bareAddress(from).split("@")[1] ?? "appcall.local";
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `<${rand}@${domain}>`;
}

// ─── Default Bun.connect-based socket factory ────────────────────────────────────

const defaultConnect: SmtpConnect = async (params) => {
  // Lazily reference Bun so the module imports cleanly under non-Bun tooling.
  const bun = (globalThis as { Bun?: { connect: (opts: unknown) => Promise<unknown> } }).Bun;
  if (!bun || typeof bun.connect !== "function") {
    throw unavailableError();
  }

  // Buffered, promise-driven adapter over Bun's callback socket API.
  params.signal?.throwIfAborted();
  const addresses = await lookup(params.host, { all: true, family: 4 });
  params.signal?.throwIfAborted();
  if (!addresses.length || addresses.some(a => prohibitedAddress(a.address))) throw unavailableError();
  let buffer = "";
  let pendingResolve: ((reply: string) => void) | null = null;
  let pendingReject: ((err: unknown) => void) | null = null;
  let closed = false;
  let socketError: unknown = null;

  const tryDeliver = () => {
    if (!pendingResolve) return;
    // A complete SMTP reply ends with a line "<code> ..." (space after code).
    const lines = buffer.split("\r\n");
    // The last element is an incomplete trailing fragment (no CRLF yet).
    let endIdx = -1;
    let consumedLen = 0;
    let acc = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      acc += line.length + 2; // + CRLF
      if (/^\d{3} /.test(line)) {
        endIdx = i;
        consumedLen = acc;
        break;
      }
    }
    if (endIdx >= 0) {
      const reply = buffer.slice(0, consumedLen).replace(/\r\n$/, "");
      buffer = buffer.slice(consumedLen);
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingReject = null;
      resolve(reply);
    }
  };

  const handlers = {
    open(socket: {end:()=>void}) { if(params.signal?.aborted)socket.end(); },
    data(_socket: unknown, data: Uint8Array) {
      if(Buffer.byteLength(buffer)+data.byteLength>65536){ socketError=upstreamError(); pendingReject?.(socketError); (_socket as any).end(); return; }
      buffer += new TextDecoder().decode(data);
      tryDeliver();
    },
    error(_socket: unknown, err: unknown) {
      socketError = err;
      if (pendingReject) {
        const reject = pendingReject;
        pendingResolve = null;
        pendingReject = null;
        reject(err);
      }
    },
    close() {
      closed = true;
      if (pendingReject) {
        const reject = pendingReject;
        pendingResolve = null;
        pendingReject = null;
        reject(socketError ?? new Error("socket closed"));
      }
    },
  };

  let rawSocket: { write: (s: string) => void; end: () => void; upgradeTLS?: (opts: unknown) => unknown };
  try {
    rawSocket = (await bun.connect({
      hostname: addresses[0]!.address,
      port: params.port,
      tls: params.tls ? { serverName: params.host, rejectUnauthorized: true } : false,
      socket: handlers,
    })) as typeof rawSocket;
  } catch {
    throw unavailableError();
  }

  const read = (): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      if (socketError) return reject(socketError);
      if (closed && buffer.length === 0) return reject(new Error("socket closed"));
      pendingResolve = resolve;
      pendingReject = reject;
      tryDeliver();
    });

  return {
    write(data: string) {
      rawSocket.write(data);
    },
    read,
    async upgradeTls() {
      if (typeof rawSocket.upgradeTLS !== "function") throw unavailableError();
      await new Promise<void>((resolve,reject)=>{
        const upgraded=rawSocket.upgradeTLS!({tls:{serverName:params.host,rejectUnauthorized:true},socket:{...handlers,handshake(_s:unknown,authorized:boolean){if(authorized)resolve();else reject(unavailableError());},error(s:unknown,error:unknown){handlers.error(s,error);reject(error);}}});
        if(Array.isArray(upgraded) && upgraded[1])rawSocket=upgraded[1];
        else reject(unavailableError());
      });
    },
    close() {
      try {
        rawSocket.end();
      } catch {
        /* ignore */
      }
    },
  };
};

// ─── Conversation driver ─────────────────────────────────────────────────────────

const CRLF = "\r\n";

async function expect(socket: SmtpSocket, errorOnFail: StructuredError): Promise<string> {
  const reply = await socket.read();
  if (Buffer.byteLength(reply)>65536 || !isPositive(replyCode(reply))) throw errorOnFail;
  return reply;
}

async function command(socket: SmtpSocket, line: string, errorOnFail: StructuredError): Promise<string> {
  await socket.write(line + CRLF);
  return expect(socket, errorOnFail);
}

export async function sendSmtpEmail(input: SmtpInput, opts: SendSmtpOptions = {}): Promise<SmtpResult> {
  const host = typeof input.smtpHost === "string" ? input.smtpHost : "";
  validateDestination(host);
  const port = normalizePort(input.smtpPort);
  validateHeaders(input);
  const user = typeof input.smtpUser === "string" ? input.smtpUser : "";
  const password = typeof input.smtpPassword === "string" ? input.smtpPassword : "";
  const from = typeof input.from === "string" ? input.from : "";
  if (!from) throw upstreamError();

  const recipients = dedupe([
    ...toAddressList(input.to),
    ...toAddressList(input.cc),
    ...toAddressList(input.bcc),
  ]);
  if (recipients.length === 0) throw upstreamError();

  // implicit TLS when smtpSecure === true OR conventionally on 465; STARTTLS otherwise.
  const implicitTls = input.smtpSecure === true || port === 465;
  const connect = opts.connect ?? input.__connect ?? defaultConnect;

  let socket: SmtpSocket;
  try {
    socket = await connectBounded(connect, { host, port, tls: implicitTls }, opts);
  } catch (err) {
    throw isStructured(err) ? err : unavailableError();
  }

  try {
    // greeting
    await expect(socket, upstreamError());

    const ehloName = "appcall";
    let ehloReply = await command(socket, `EHLO ${ehloName}`, upstreamError());

    let tlsActive = implicitTls;
    // STARTTLS upgrade for plaintext connections that advertise it.
    if (!implicitTls && /STARTTLS/i.test(ehloReply) && typeof socket.upgradeTls === "function") {
      await command(socket, "STARTTLS", upstreamError());
      await socket.upgradeTls();
      tlsActive = true;
      ehloReply = await command(socket, `EHLO ${ehloName}`, upstreamError());
    }

    // AUTH LOGIN (base64 user, then base64 password).
    if (user) {
      if (!tlsActive) throw upstreamError();
      await command(socket, "AUTH LOGIN", upstreamError());
      await command(socket, b64(user), upstreamError());
      await command(socket, b64(password), upstreamError());
    }

    if (!tlsActive) throw upstreamError();
    await command(socket, `MAIL FROM:<${bareAddress(from)}>`, upstreamError());

    const accepted: string[] = [];
    for (const rcpt of recipients) {
      const bare = bareAddress(rcpt);
      await command(socket, `RCPT TO:<${bare}>`, upstreamError());
      accepted.push(bare);
    }

    await command(socket, "DATA", upstreamError());

    const messageId = defaultMessageId(from);
    const message = buildMessage({
      from,
      to: toAddressList(input.to),
      cc: toAddressList(input.cc),
      subject: typeof input.subject === "string" ? input.subject : "",
      text: typeof input.text === "string" ? input.text : undefined,
      html: typeof input.html === "string" ? input.html : undefined,
      replyTo: toAddressList(input.replyTo),
      messageId,
    });

    // message terminated by CRLF "." CRLF
    await command(socket, message + CRLF + ".", upstreamError());

    // best-effort QUIT; do not fail the send if QUIT misbehaves.
    try {
      await command(socket, "QUIT", upstreamError());
    } catch {
      /* ignore QUIT errors */
    }

    return { messageId, accepted };
  } catch (err) {
    throw isStructured(err) ? err : upstreamError();
  } finally {
    try {
      await socket.close();
    } catch {
      /* ignore */
    }
  }
}

// ─── Credential verification (no message sent) ───────────────────────────────
//
// verifySmtp proves a set of SMTP credentials is accepted by the relay without
// sending any mail. It walks the same opening handshake as sendSmtpEmail —
// greeting → EHLO → optional STARTTLS → AUTH LOGIN → QUIT — but stops before
// MAIL/RCPT/DATA. A 235 (auth accepted) anywhere in the AUTH exchange yields
// { ok:true }; an auth rejection (e.g. 535) surfaces as CONNECTOR_UPSTREAM_ERROR.
// A failure to connect surfaces as CONNECTOR_UNAVAILABLE. The connect factory is
// injectable (opts.connect or input.__connect) so it is unit-testable with a
// scripted fake socket — exactly like sendSmtpEmail.

export interface VerifySmtpResult {
  ok: true;
}

export async function verifySmtp(input: SmtpInput, opts: SendSmtpOptions = {}): Promise<VerifySmtpResult> {
  const host = typeof input.smtpHost === "string" ? input.smtpHost : "";
  validateDestination(host);
  const port = normalizePort(input.smtpPort);
  validateHeaders(input);
  const user = typeof input.smtpUser === "string" ? input.smtpUser : "";
  const password = typeof input.smtpPassword === "string" ? input.smtpPassword : "";

  const implicitTls = input.smtpSecure === true || port === 465;
  const connect = opts.connect ?? input.__connect ?? defaultConnect;

  let socket: SmtpSocket;
  try {
    socket = await connectBounded(connect, { host, port, tls: implicitTls }, opts);
  } catch (err) {
    throw isStructured(err) ? err : unavailableError();
  }

  try {
    // greeting
    await expect(socket, unavailableError());

    const ehloName = "appcall";
    let ehloReply = await command(socket, `EHLO ${ehloName}`, upstreamError());

    let tlsActive = implicitTls;
    // STARTTLS upgrade for plaintext connections that advertise it.
    if (!implicitTls && /STARTTLS/i.test(ehloReply) && typeof socket.upgradeTls === "function") {
      await command(socket, "STARTTLS", upstreamError());
      await socket.upgradeTls();
      tlsActive = true;
      ehloReply = await command(socket, `EHLO ${ehloName}`, upstreamError());
    }

    // AUTH LOGIN (base64 user, then base64 password). The final reply after the
    // password must be 235 (authentication succeeded) for credentials to be valid.
    if (user) {
      if (!tlsActive) throw upstreamError();
      await command(socket, "AUTH LOGIN", upstreamError());
      await command(socket, b64(user), upstreamError());
      await socket.write(b64(password) + CRLF);
      const authReply = await socket.read();
      if (replyCode(authReply) !== 235) throw upstreamError();
    }

    // best-effort QUIT; never run MAIL/RCPT/DATA — this verifies creds only.
    try {
      await command(socket, "QUIT", upstreamError());
    } catch {
      /* ignore QUIT errors */
    }

    return { ok: true };
  } catch (err) {
    throw isStructured(err) ? err : upstreamError();
  } finally {
    try {
      await socket.close();
    } catch {
      /* ignore */
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizePort(v: unknown): number {
  const n = v === undefined ? 587 : typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  if(!Number.isInteger(n) || ![25,465,587,2525].includes(n)) throw upstreamError();
  return n;
}

function prohibitedAddress(host:string): boolean {
 const value=host.toLowerCase();
 if(value.includes(":")) return true; // IPv6 relays require an explicit future allowlist.
 const octets=value.split(".").map(Number);
 return octets[0]===0 || octets[0]===10 || octets[0]===127 || octets[0]!>=224 || (octets[0]===169 && octets[1]===254) || (octets[0]===172 && octets[1]!>=16 && octets[1]!<=31) || (octets[0]===192 && octets[1]===168) || (octets[0]===100 && octets[1]!>=64 && octets[1]!<=127) || (octets[0]===198 && (octets[1]===18||octets[1]===19));
}
function validateDestination(host:string): void {
 if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || !host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") || (isIP(host)!==0 && prohibitedAddress(host))) throw upstreamError();
}
function validateHeaders(input:Record<string,unknown>):void {
 for(const key of ["from","to","cc","bcc","replyTo","subject","messageId","date"]){
  const value=input[key];
  for(const item of Array.isArray(value)?value:[value]) if(typeof item==='string' && /[\r\n\x00]/.test(item))throw upstreamError();
 }
 for(const key of ["from","to","cc","bcc","replyTo"])for(const address of toAddressList(input[key]))if(!/^[^<>\s@]+@[^<>\s@]+$/.test(bareAddress(address)))throw upstreamError();
}
async function connectBounded(connect:SmtpConnect, params:SmtpConnectParams, opts:SendSmtpOptions):Promise<SmtpSocket>{
 const context=executionContext();
 const deadline=Math.min(Date.now()+(opts.timeoutMs??30000),context?.deadlineUnixMs??Infinity);
 const signals=[opts.signal,context?.signal].filter((s):s is AbortSignal=>!!s);
 if(deadline<=Date.now()||signals.some(s=>s.aborted))throw timeoutError();
 let socket:SmtpSocket|undefined;
 let rejectAbort:(error:unknown)=>void=()=>{};
 let aborted=false;
 const controller=new AbortController();
 const abort=()=>{aborted=true;controller.abort(timeoutError());void socket?.close();rejectAbort(timeoutError());};
 const abortedPromise=new Promise<never>((_,reject)=>{rejectAbort=reject;});
 // Mark handled even between operations.
 void abortedPromise.catch(()=>{});
 const timer=setTimeout(abort,Math.max(0,deadline-Date.now()));
 for(const signal of signals)signal.addEventListener('abort',abort,{once:true});
 const cleanup=()=>{clearTimeout(timer);for(const signal of signals)signal.removeEventListener('abort',abort);};
 try {
  socket=await Promise.race([connect({...params,signal:controller.signal}).then(s=>{if(aborted){void s.close();throw timeoutError();}return s;}),abortedPromise]);
 }catch(error){cleanup();throw error;}
 const raw=socket;
 const bounded=<T>(operation:()=>T|Promise<T>):Promise<T>=>{if(aborted)return Promise.reject(timeoutError());return Promise.race([Promise.resolve().then(operation),abortedPromise]);};
 return {write:data=>bounded(()=>raw.write(data)),read:()=>bounded(async()=>{const reply=await raw.read();if(Buffer.byteLength(reply)>65536)throw upstreamError();return reply;}),upgradeTls:raw.upgradeTls?()=>bounded(()=>raw.upgradeTls!()):undefined,close:()=>{cleanup();void raw.close();}};
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = bareAddress(item).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function isStructured(err: unknown): err is StructuredError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { ok?: unknown }).ok === false &&
    typeof (err as { code?: unknown }).code === "string"
  );
}
