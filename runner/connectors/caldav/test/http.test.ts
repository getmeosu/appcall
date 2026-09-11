import { describe, expect, test } from "bun:test";
import { parseCalDAVRateLimit, buildBasicAuth, resolveBaseUrl, createCalDAVClient, ICLOUD_BASE_URL } from "../src/http";

describe("parseCalDAVRateLimit", () => {
  test("returns limited=true for 429 with retry-after header", () => {
    const result = parseCalDAVRateLimit(429, { "retry-after": "30" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });

  test("defaults retryAfterSeconds to 10 when header missing", () => {
    const result = parseCalDAVRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  test("returns limited=false for non-429 status", () => {
    expect(parseCalDAVRateLimit(200, {}).limited).toBe(false);
    expect(parseCalDAVRateLimit(500, {}).limited).toBe(false);
    expect(parseCalDAVRateLimit(401, {}).limited).toBe(false);
  });
});

describe("buildBasicAuth", () => {
  test("returns Basic base64(user:pass)", () => {
    const auth = buildBasicAuth("user@example.com", "secret123");
    expect(auth.startsWith("Basic ")).toBe(true);
    const decoded = atob(auth.slice(6));
    expect(decoded).toBe("user@example.com:secret123");
  });

  test("encodes special characters", () => {
    const auth = buildBasicAuth("user+1@icloud.com", "p@ss!word=");
    const decoded = atob(auth.slice(6));
    expect(decoded).toBe("user+1@icloud.com:p@ss!word=");
  });

  test("preserves surrounding ASCII and Unicode whitespace as UTF-8", () => {
    const username = " user@example.com ";
    const password = "\u00a0app-password\u00a0";
    const auth = buildBasicAuth(username, password);
    const decodedBytes = Uint8Array.from(atob(auth.slice(6)), (character) => character.charCodeAt(0));

    expect([...decodedBytes]).toEqual([...new TextEncoder().encode(`${username}:${password}`)]);
  });

  test("preserves U+2003 secret whitespace in decoded UTF-8 bytes", () => {
    const username = "user@example.com";
    const password = "\u{2003}app-password\u{2003}";
    const auth = buildBasicAuth(username, password);
    const decodedBytes = Uint8Array.from(atob(auth.slice(6)), (character) => character.charCodeAt(0));

    expect([...decodedBytes]).toEqual([...new TextEncoder().encode(`${username}:${password}`)]);
  });
});

describe("resolveBaseUrl", () => {
  test("returns iCloud default when no baseUrl provided", () => {
    expect(resolveBaseUrl()).toBe(ICLOUD_BASE_URL);
    expect(resolveBaseUrl("")).toBe(ICLOUD_BASE_URL);
  });

  test("returns trimmed user-supplied URL without trailing slash", () => {
    expect(resolveBaseUrl("https://caldav.fastmail.com/")).toBe("https://caldav.fastmail.com");
    expect(resolveBaseUrl("https://caldav.fastmail.com")).toBe("https://caldav.fastmail.com");
  });
});

describe("createCalDAVClient host validation", () => {
  test("throws for a host not in allowedHosts", () => {
    expect(() => createCalDAVClient({
      username: "user",
      password: "pass",
      baseUrl: "https://not-allowed-host.example.com",
    })).toThrow("not in the connector's allowedHosts");
  });

  test("succeeds for caldav.icloud.com", () => {
    expect(() => createCalDAVClient({
      username: "user",
      password: "pass",
      baseUrl: "https://caldav.icloud.com",
    })).not.toThrow();
  });

  test("succeeds for caldav.fastmail.com", () => {
    expect(() => createCalDAVClient({
      username: "user",
      password: "pass",
      baseUrl: "https://caldav.fastmail.com",
    })).not.toThrow();
  });

  test("makes PROPFIND request with correct headers", async () => {
    const requests: Request[] = [];
    const client = createCalDAVClient({
      username: "testuser@icloud.com",
      password: "app-password",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("<multistatus/>", { status: 207 });
      },
    });
    await client.propfind("/", "0", "<D:propfind/>");
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PROPFIND");
    expect(requests[0].headers.get("Depth")).toBe("0");
    expect(requests[0].headers.get("Content-Type")).toContain("application/xml");
    const auth = requests[0].headers.get("Authorization");
    expect(auth?.startsWith("Basic ")).toBe(true);
  });

  test("makes REPORT request with Depth:1", async () => {
    const requests: Request[] = [];
    const client = createCalDAVClient({
      username: "testuser@icloud.com",
      password: "app-password",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("<multistatus/>", { status: 207 });
      },
    });
    await client.report("/1234/calendars/home/", "1", "<C:calendar-query/>");
    expect(requests[0].method).toBe("REPORT");
    expect(requests[0].headers.get("Depth")).toBe("1");
  });

  test("PUT create sends If-None-Match: *", async () => {
    const requests: Request[] = [];
    const client = createCalDAVClient({
      username: "testuser@icloud.com",
      password: "app-password",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 201 });
      },
    });
    await client.putCreate("/1234/calendars/home/event.ics", "BEGIN:VCALENDAR...");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("If-None-Match")).toBe("*");
    expect(requests[0].headers.get("Content-Type")).toContain("text/calendar");
  });

  test("PUT update sends If-Match with etag", async () => {
    const requests: Request[] = [];
    const client = createCalDAVClient({
      username: "testuser@icloud.com",
      password: "app-password",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    await client.putUpdate("/1234/calendars/home/event.ics", "myetag123", "BEGIN:VCALENDAR...");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("If-Match")).toBe("myetag123");
  });

  test("DELETE sends If-Match when etag provided", async () => {
    const requests: Request[] = [];
    const client = createCalDAVClient({
      username: "testuser@icloud.com",
      password: "app-password",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    await client.delete("/1234/calendars/home/event.ics", "etag-xyz");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("If-Match")).toBe("etag-xyz");
  });
});
