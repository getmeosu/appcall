import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("Help Scout pilot manifest", () => {
  test("declares OAuth, bounded hosts, and read-only operations", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.oauth).toEqual({
      authorizeUrl: "https://secure.helpscout.net/authentication/authorizeClientApplication",
      tokenUrl: "https://api.helpscout.net/v2/oauth2/token",
      pkce: false,
      supportsRefresh: true,
      clientAuth: "body",
    });
    expect(manifest.models).toEqual(["inbox", "user", "tag", "conversation", "thread"]);
    expect(manifest.provenance.source).toEqual({ url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
    expect(manifest.categories).toEqual(["crm", "productivity"]);
    expect(manifest.network.allowedHosts).toEqual(["api.helpscout.net", "secure.helpscout.net"]);
    expect(Object.keys(manifest.operations)).toEqual(["healthcheck", "inboxes.list", "users.list", "tags.list", "conversations.list", "conversations.get", "threads.list"]);
    for (const operation of Object.values(manifest.operations)) expect(operation.sideEffect).toBe("read");
  });
});
