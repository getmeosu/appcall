import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const originalOps = ["conversations.create", "conversations.update", "customers.create", "customers.update", "threads.create", "threads.notes.create", "healthcheck", "inboxes.list", "users.list", "users.me", "users.get", "tags.list", "conversations.list", "conversations.get", "threads.list", "customers.list", "customers.get", "mailboxes.list", "mailboxes.get"] as const;

describe("Help Scout Composio-deepened manifest", () => {
  test("keeps OAuth, hosts, provenance, and original operations", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.oauth).toEqual({
      authorizeUrl: "https://secure.helpscout.net/authentication/authorizeClientApplication",
      tokenUrl: "https://api.helpscout.net/v2/oauth2/token",
      pkce: false,
      supportsRefresh: true,
      clientAuth: "body",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.helpscout.net", "secure.helpscout.net"]);
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.provenance.source).toEqual({ url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" });
    expect(manifest.http.baseUrl).toBe("https://api.helpscout.net/v2");
    for (const key of originalOps) expect(manifest.operations[key]).toBeTruthy();
  });

  test("every operation is a real HTTP tool with title, description, and object inputSchema", () => {
    expect(Object.keys(manifest.operations).length).toBeGreaterThanOrEqual(131);
    for (const [key, operation] of Object.entries(manifest.operations)) {
      expect(operation.title, key).toBeTruthy();
      expect(operation.description, key).toBeTruthy();
      expect(operation.inputSchema?.type, key).toBe("object");
      expect(operation.request, `${key} needs a request block`).toBeTruthy();
      expect(operation.request.method, key).toBeTruthy();
      expect(operation.request.path, key).toBeTruthy();
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });
});
