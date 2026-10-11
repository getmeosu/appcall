import { describe, expect, it } from "bun:test";
import { actions } from "../src/actions";
import { normalizeNextDnsInput } from "../src/actions";

const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status });

describe("next-dns aliases", () => {
  it("copies profile/config aliases onto profileId", () => {
    const out = normalizeNextDnsInput("allowlist.get", { profile: "abc123" }) as Record<string, unknown>;
    expect(out.profileId).toBe("abc123");
    expect(out.config).toBe("abc123");
    expect(out.config_id).toBe("abc123");
    expect(out.profile_id).toBe("abc123");
  });

  it("copies from_date/to_date onto from/to", () => {
    const out = normalizeNextDnsInput("analytics.domains", { profileId: "abc123", from_date: "-7d", to_date: "now" }) as Record<string, unknown>;
    expect(out.from).toBe("-7d");
    expect(out.to).toBe("now");
  });

  it("inverts enable onto drop_ip for client IP logging", () => {
    const enabled = normalizeNextDnsInput("settings.logs.client_ips", { profileId: "abc123", enable: true }) as Record<string, unknown>;
    expect(enabled.drop_ip).toBe(false);
    const disabled = normalizeNextDnsInput("settings.logs.client_ips", { profileId: "abc123", enable: false }) as Record<string, unknown>;
    expect(disabled.drop_ip).toBe(true);
  });

  it("inverts enabled onto drop_domain for domain logging", () => {
    const out = normalizeNextDnsInput("settings.logs.domains", { config_id: "abc123", enabled: true }) as Record<string, unknown>;
    expect(out.profileId).toBe("abc123");
    expect(out.drop_domain).toBe(false);
  });

  it("dispatches allowlist.get with Composio profile alias", async () => {
    const seen: string[] = [];
    const result = await actions["allowlist.get"]!({
      profile: "abc123",
      apiKey: "fixture-key",
      fetch: async (url: RequestInfo | URL) => {
        seen.push(String(url));
        return response({ data: [{ id: "nytimes.com", active: true }] });
      },
    });
    expect(seen).toEqual(["https://api.nextdns.io/profiles/abc123/allowlist"]);
    expect(result).toMatchObject({ connector: "next-dns", action: "allowlist.get", source: "provider" });
  });

  it("dispatches logs.list with profile plus from_date", async () => {
    const seen: string[] = [];
    await actions["logs.list"]!({
      profile: "abc123",
      from_date: "-1d",
      apiKey: "fixture-key",
      fetch: async (url: RequestInfo | URL) => {
        seen.push(String(url));
        return response({ data: [] });
      },
    });
    expect(seen[0]).toBe("https://api.nextdns.io/profiles/abc123/logs?from=-1d");
  });

  it("PATCHes drop.ip=false when enable=true", async () => {
    let body: string | null = null;
    await actions["settings.logs.client_ips"]!({
      config_id: "abc123",
      enable: true,
      apiKey: "fixture-key",
      fetch: async (_url: RequestInfo | URL, init?: RequestInit) => {
        body = init?.body == null ? null : String(init.body);
        return response(null, 204);
      },
    });
    expect(body).toBe(JSON.stringify({ drop: { ip: false } }));
  });
});
