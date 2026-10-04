import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const writeOps = [
  "conversations.create",
  "conversations.update",
  "customers.create",
  "customers.update",
  "threads.create",
  "threads.notes.create",
] as const;

const readOps = [
  "healthcheck",
  "inboxes.list",
  "users.list",
  "users.me",
  "users.get",
  "tags.list",
  "conversations.list",
  "conversations.get",
  "threads.list",
  "customers.list",
  "customers.get",
  "mailboxes.list",
  "mailboxes.get",
] as const;

describe("Help Scout pilot manifest", () => {
  test("declares OAuth, bounded hosts, and mixed read/write operations", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.oauth).toEqual({
      authorizeUrl: "https://secure.helpscout.net/authentication/authorizeClientApplication",
      tokenUrl: "https://api.helpscout.net/v2/oauth2/token",
      pkce: false,
      supportsRefresh: true,
      clientAuth: "body",
    });
    expect(manifest.models).toEqual(["inbox", "user", "tag", "conversation", "thread", "customer", "mailbox"]);
    expect(manifest.provenance.source).toEqual({ url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
    expect(manifest.categories).toEqual(["crm", "productivity"]);
    expect(manifest.network.allowedHosts).toEqual(["api.helpscout.net", "secure.helpscout.net"]);
    expect(manifest.version).toBe("0.2.0");
    expect(Object.keys(manifest.operations).sort()).toEqual([...readOps, ...writeOps].sort());
    for (const key of readOps) expect(manifest.operations[key].sideEffect).toBe("read");
    for (const key of writeOps) expect(manifest.operations[key].sideEffect).toBe("write");
    for (const operation of Object.values(manifest.operations)) {
      expect(operation.title).toBeTruthy();
      expect(operation.description).toBeTruthy();
      expect(operation.inputSchema?.type).toBe("object");
    }
  });
});
