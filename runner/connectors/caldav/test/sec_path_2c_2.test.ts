import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";
import { ICLOUD_PARTITION_HOST, resolveCollectionHref } from "../src/http";

// SEC-PATH-2c-2 (linus's caldav rulings, applied to every href input): an href is
// resolved per RFC 3986 against the configured CalDAV URL. The trust boundary is
// the origin (https, same host and port), plus iCloud partition hosts
// pN-caldav.icloud.com on 443 when the configured server is caldav.icloud.com.
// No dot segments (raw or %2e, any case), no backslash, no "//", no blank or
// whitespace segments, no userinfo, query or fragment. Event resources need a
// non-empty last segment; collections may end in one "/". Anything else is
// INVALID_ACTION_INPUT with zero requests. Before this fix "/a/../b.ics" and
// "%2e%2e" collapsed, any allowlisted host was reachable, and "x" was appended to
// the host ("https://caldav.icloud.comx").
const CREDS = { username: "u", password: "p" };
const WHEN = { start: "2026-01-01T10:00:00Z", end: "2026-01-01T11:00:00Z" };
const OPS: Array<{ op: string; field: string; kind: "resource" | "collection"; extra: Record<string, unknown> }> = [
  { op: "events.get", field: "eventHref", kind: "resource", extra: {} },
  { op: "events.update", field: "eventHref", kind: "resource", extra: { etag: "e1", uid: "u1", summary: "s", ...WHEN } },
  { op: "events.delete", field: "eventHref", kind: "resource", extra: {} },
  { op: "calendar_home.get", field: "principalHref", kind: "collection", extra: {} },
  { op: "calendars.list", field: "calendarHomeHref", kind: "collection", extra: {} },
  { op: "events.list", field: "calendarHref", kind: "collection", extra: {} },
  { op: "events.create", field: "calendarHref", kind: "collection", extra: { summary: "s", uid: "u1", ...WHEN } },
  { op: "freebusy.query", field: "href", kind: "collection", extra: WHEN },
];
const BAD_ALL = [
  "", " ", " /1/c/e.ics", "/1/c/e.ics ", ".", "..", "%2e", "%2E%2e",
  "/1/../c/e.ics", "/1/./c/e.ics", "/1/%2e%2e/c/e.ics", "/1/%2E%2E/c/e.ics", "/1/.%2e/c/e.ics", "/1/%2e/c/e.ics", "/1/c/..", "/1/c/%2e%2e",
  "/1//c/e.ics", "//evil.example/1/c/e.ics", "https://evil.example/1/c/e.ics", "//p01-caldav.icloud.com//c/e.ics",
  "http://caldav.icloud.com/1/c/e.ics", "https://caldav.icloud.com:8443/1/c/e.ics", "https://u:p@caldav.icloud.com/1/c/e.ics",
  "/1/c/e.ics?x=1", "/1/c/e.ics#f", "/1\\c\\e.ics", "/1/c/e\u0000.ics", "/", "/1/ /c/e.ics", "/1/%20/c/e.ics", "/1/%09/c/e.ics",
  // iCloud partition lookalikes
  "https://p1234-caldav.icloud.com/1/c/e.ics", "https://pX-caldav.icloud.com/1/c/e.ics", "https://p1-caldav.icloud.com.evil/1/c/e.ics",
  "https://p1-caldav.icloud.com/1/c/e.ics", "https://p0-caldav.icloud.com/1/c/e.ics", "https://p00-caldav.icloud.com/1/c/e.ics",
  "https://p100-caldav.icloud.com/1/c/e.ics", "https://p001-caldav.icloud.com/1/c/e.ics", "https://p123-caldav.icloud.com/1/c/e.ics",
  "https://p01-caldav.icloud.com:8443/1/c/e.ics", "http://p01-caldav.icloud.com/1/c/e.ics", "https://u@p01-caldav.icloud.com/1/c/e.ics",
  "https://p01-caldav.icloud.com.evil.example/1/c/e.ics", "https://xp01-caldav.icloud.com/1/c/e.ics", "https://p01-caldav.icloud.co/1/c/e.ics",
  "https://p01-caldav.icloud.com/1/../c/e.ics",
];

async function send(op: string, extra: Record<string, unknown>, field: string, value: string, baseUrl?: string) {
  return outcomeOf("caldav", op, { ...CREDS, ...(baseUrl ? { baseUrl } : {}), ...extra, [field]: value });
}

describe("caldav SEC-PATH-2c-2 href resolution", () => {
  for (const { op, field, kind, extra } of OPS) {
    const good = kind === "resource"
      ? ["/1/c/e.ics", "1/c/e.ics", "https://caldav.icloud.com/1/c/e.ics", "/1/c/My%20Event.ics", "https://p01-caldav.icloud.com/1/c/e.ics", "https://P42-CalDAV.icloud.com:443/1/c/e.ics"]
      : ["/1/c/", "/1/c", "1/c/", "https://caldav.icloud.com/1/c/", "https://p01-caldav.icloud.com/1/c/"];
    test(`${op} ${field} accepts same-origin and iCloud partition hrefs`, async () => {
      for (const value of good) {
        const result = await send(op, extra, field, value);
        expect(result.calls.length, `${op} ${field}=${value}: ${result.code} ${result.message}`).toBeGreaterThan(0);
        const url = new URL(result.calls[0]!.url);
        expect(url.origin).toMatch(/^https:\/\/(?:caldav|p(?:0[1-9]|[1-9][0-9])-caldav)\.icloud\.com$/);
        expect(url.pathname.startsWith("/1/c")).toBe(true);
      }
    });
    test(`${op} ${field} rejects other hrefs with 0 fetches`, async () => {
      const bad = kind === "resource" ? [...BAD_ALL, "/1/c/", "/1/c/e.ics/"] : [...BAD_ALL, "/1/c//"];
      for (const value of bad) {
        const result = await send(op, extra, field, value);
        expect(result.calls, `${op} ${field}=${JSON.stringify(value)}`).toEqual([]);
        expect(result.ok).toBe(false);
        expect(result.code, `${op} ${field}=${JSON.stringify(value)} ${result.message}`).toBe("INVALID_ACTION_INPUT");
      }
    });
  }

  test("the origin is the trust boundary: '/x' against .../dav resolves to the origin root", async () => {
    const baseUrl = "https://caldav.fastmail.com/dav";
    const root = await send("events.get", {}, "eventHref", "/x", baseUrl);
    expect(root.calls.map((c) => c.url)).toEqual(["https://caldav.fastmail.com/x"]);
    const absolutePath = await send("events.get", {}, "eventHref", "/calendars/user/e.ics", baseUrl);
    expect(absolutePath.calls.map((c) => c.url)).toEqual(["https://caldav.fastmail.com/calendars/user/e.ics"]);
    const underBase = await send("events.get", {}, "eventHref", "/dav/calendars/user/e.ics", baseUrl);
    expect(underBase.calls.map((c) => c.url)).toEqual(["https://caldav.fastmail.com/dav/calendars/user/e.ics"]);
    const relative = await send("events.get", {}, "eventHref", "calendars/user/e.ics", baseUrl);
    expect(relative.calls.map((c) => c.url)).toEqual(["https://caldav.fastmail.com/dav/calendars/user/e.ics"]);
    const sameOriginAbsolute = await send("events.get", {}, "eventHref", "https://caldav.fastmail.com/other/e.ics", baseUrl);
    expect(sameOriginAbsolute.calls.map((c) => c.url)).toEqual(["https://caldav.fastmail.com/other/e.ics"]);
  });

  test("a cross-origin absolute href is rejected with 0 fetches", async () => {
    const baseUrl = "https://caldav.fastmail.com/dav";
    for (const value of [
      "https://caldav.icloud.com/dav/e.ics", "https://p01-caldav.icloud.com/dav/e.ics", "https://evil.example/dav/e.ics",
      "//evil.example/dav/e.ics", "http://caldav.fastmail.com/dav/e.ics", "https://caldav.fastmail.com:8443/dav/e.ics",
      "https://caldav.fastmail.com.evil/dav/e.ics", "/dav/../e.ics", "/dav//e.ics", "/dav/ /e.ics",
    ]) {
      const result = await send("events.get", {}, "eventHref", value, baseUrl);
      expect(result.calls, value).toEqual([]);
      expect(result.code, value).toBe("INVALID_ACTION_INPUT");
    }
  });

  test("iCloud partitions: the hard-coded allowlist and nothing else", () => {
    expect(ICLOUD_PARTITION_HOST.source).toBe("^p(?:0[1-9]|[1-9][0-9])-caldav\\.icloud\\.com$");
    for (const host of ["p01-caldav.icloud.com", "p09-caldav.icloud.com", "p10-caldav.icloud.com", "p99-caldav.icloud.com", "P07-CALDAV.ICLOUD.COM"]) {
      expect(resolveCollectionHref(undefined, `https://${host}/1/c/e.ics`, "eventHref", "resource"), host)
        .toBe(`https://${host.toLowerCase()}/1/c/e.ics`);
      expect(resolveCollectionHref(undefined, `https://${host}:443/1/c/e.ics`, "eventHref", "resource")).toBe(`https://${host.toLowerCase()}/1/c/e.ics`);
    }
    for (const href of [
      "https://p1234-caldav.icloud.com/1/c/e.ics", "https://pX-caldav.icloud.com/1/c/e.ics", "https://p-caldav.icloud.com/1/c/e.ics",
      "https://p1-caldav.icloud.com.evil/1/c/e.ics", "https://p1-caldav.icloud.com./1/c/e.ics", "https://p1-caldav.icloud.com:8443/1/c/e.ics",
      "http://p1-caldav.icloud.com/1/c/e.ics", "https://p1caldav.icloud.com/1/c/e.ics", "https://p1-caldav.icloud.com@evil.example/1/c/e.ics",
      "https://a.p1-caldav.icloud.com/1/c/e.ics", "https://p1-caldav-icloud.com/1/c/e.ics",
      // Exactly the manifest's p01..p99: one digit, zero, three digits all reject.
      "https://p1-caldav.icloud.com/1/c/e.ics", "https://p7-caldav.icloud.com/1/c/e.ics", "https://p0-caldav.icloud.com/1/c/e.ics",
      "https://p00-caldav.icloud.com/1/c/e.ics", "https://p100-caldav.icloud.com/1/c/e.ics", "https://p001-caldav.icloud.com/1/c/e.ics",
      "https://p123-caldav.icloud.com/1/c/e.ics", "https://p999-caldav.icloud.com/1/c/e.ics",
    ]) {
      expect(() => resolveCollectionHref(undefined, href, "eventHref", "resource"), href).toThrow();
    }
    // Partitions count only when the configured server is caldav.icloud.com.
    for (const baseUrl of ["https://caldav.fastmail.com", "https://caldav.fastmail.com/dav", "https://p01-caldav.icloud.com"]) {
      expect(() => resolveCollectionHref(baseUrl, "https://p02-caldav.icloud.com/1/c/e.ics", "eventHref", "resource"), baseUrl).toThrow();
    }
    expect(resolveCollectionHref("https://caldav.icloud.com/", "https://p02-caldav.icloud.com/1/c/", "calendarHref", "collection")).toBe("https://p02-caldav.icloud.com/1/c/");
  });

  test("a partition href reaches the partition host through the real client", async () => {
    const result = await send("events.get", {}, "eventHref", "https://p17-caldav.icloud.com/123/calendars/home/e.ics");
    expect(result.calls.map((c) => c.url)).toEqual(["https://p17-caldav.icloud.com/123/calendars/home/e.ics"]);
  });

  test("events.create: a uid cannot escape or collapse the calendar", async () => {
    const ok = await send("events.create", { summary: "s", uid: "abc-123", ...WHEN }, "calendarHref", "/1/c/");
    expect(ok.calls.map((c) => new URL(c.url).pathname)).toEqual(["/1/c/abc-123.ics"]);
    for (const uid of ["../../x", "a/../../b", "a//b"]) {
      const result = await send("events.create", { summary: "s", uid, ...WHEN }, "calendarHref", "/1/c/");
      expect(result.calls, uid).toEqual([]);
      expect(result.code, uid).toBe("INVALID_ACTION_INPUT");
    }
  });
});

describe("caldav iCloud partition href check matches the network allowlist", () => {
  test("every partition host the href check admits is in manifest.network.allowedHosts, and vice versa", async () => {
    const manifest = (await import("../manifest.json")).default as { network: { allowedHosts: string[] } };
    const listed = manifest.network.allowedHosts.filter((host) => /^p[0-9]+-caldav\.icloud\.com$/.test(host)).sort();
    const admitted: string[] = [];
    for (let n = 0; n <= 1000; n++) {
      for (const digits of new Set([String(n), String(n).padStart(2, "0"), String(n).padStart(3, "0")])) {
        const host = `p${digits}-caldav.icloud.com`;
        if (ICLOUD_PARTITION_HOST.test(host)) admitted.push(host);
      }
    }
    expect(admitted.sort()).toEqual(listed);
    expect(listed).toHaveLength(99);
  });

  test("p1-, p0-, p00- and p100- are rejected at the href check with 0 fetches", async () => {
    for (const host of ["p1", "p0", "p00", "p100"]) {
      const result = await outcomeOf("caldav", "events.get", { ...CREDS, eventHref: `https://${host}-caldav.icloud.com/1/c/e.ics` });
      expect(result.calls, host).toEqual([]);
      expect(result.code, host).toBe("INVALID_ACTION_INPUT");
    }
  });
});
