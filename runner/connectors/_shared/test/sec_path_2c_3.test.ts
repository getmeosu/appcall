// SEC-PATH-2c-3: host-bound setup fields (bamboohr companyDomain, confluence
// site, docusign restHost/oauthHost) and the telegram bot token path segment,
// driven through the real registry with the shared SEC-PATH-2c harness. Every
// unsafe value must fail with INVALID_ACTION_INPUT (INVALID_SYNC_INPUT for the
// sync) and 0 fetches, and the secret must never be echoed.
import { describe, expect, test } from "bun:test";
import { BLANK, DOT_ONLY, PERCENT_DOTS, SEPARATORS, outcomeOf } from "./path_segment_harness";
import bamboohr from "../../bamboohr/manifest.json";
import confluence from "../../confluence/manifest.json";
import docusign from "../../docusign/manifest.json";
import telegram from "../../telegram/manifest.json";

const SECRET = "s3cr3t-never-echo";
const COMMON = [...DOT_ONLY, ...BLANK, ...PERCENT_DOTS, ...SEPARATORS, "a b", "a?b", "a#b", "a@b", "a:1", "%20", "a\nb"];
const BAD_LABELS = [...COMMON, "a.b", "-a", "a-", "a_b", "acme.evil.example"];
const BAD_HOSTS = [...COMMON, "a", "a..b", ".a.b", "a.b.", "-a.b", "a_b.c", "a. b", "https://a.b", "a.b/x", "a.b:443", "u@a.b"];
const BAD_TOKENS = [...DOT_ONLY, ...BLANK, ...PERCENT_DOTS, ...SEPARATORS, "1:a/b", "1:a b", "1:a%2e", "1:a?b", "1:a#b", "1:a.b", "1:a\nb", ":abc", "abc:def", "1:", "1:a:b", "bad-token"];

const ops = (manifest: { operations: Record<string, unknown> }) => [...Object.keys(manifest.operations), "__healthcheck"];

async function expectRejected(connector: string, op: string, input: Record<string, unknown>) {
  const result = op === "__healthcheck" ? await outcomeOf(connector, "", input, "healthcheck") : await outcomeOf(connector, op, input);
  const label = `${connector} ${op} ${JSON.stringify(input)}`;
  expect(result.calls, label).toEqual([]);
  if (result.code === "ACTION_NOT_EXECUTABLE") return; // trigger / webhook-only operations
  expect(result.code, label).toBe("INVALID_ACTION_INPUT");
  expect(String(result.message ?? "")).not.toContain(SECRET);
}

describe("SEC-PATH-2c-3", () => {
  test("bamboohr companyDomain is one host label: every op and the healthcheck", async () => {
    for (const op of ops(bamboohr as never)) {
      for (const bad of BAD_LABELS) await expectRejected("bamboohr", op, { apiKey: SECRET, companyDomain: bad });
    }
  });
  test("confluence site is a bare hostname: every op and the healthcheck", async () => {
    for (const op of ops(confluence as never)) {
      for (const bad of BAD_HOSTS) await expectRejected("confluence", op, { site: bad, email: "a@b.co", apiToken: SECRET });
    }
  });
  test("docusign restHost and oauthHost are bare hostnames: every op and the healthcheck", async () => {
    for (const op of ops(docusign as never)) {
      for (const bad of BAD_HOSTS) {
        await expectRejected("docusign", op, { accessToken: SECRET, restHost: bad, oauthHost: "account-d.docusign.com" });
        await expectRejected("docusign", op, { accessToken: SECRET, restHost: "demo.docusign.net", oauthHost: bad });
      }
    }
  });
  test("telegram botToken matches ^\\d+:[A-Za-z0-9_-]+$: every action and the healthcheck", async () => {
    for (const op of ops(telegram as never)) {
      if (op === "healthcheck") continue;
      for (const bad of BAD_TOKENS) {
        if (op === "__healthcheck" && bad === "") continue; // empty token = static setup-validation path
        await expectRejected("telegram", op, { botToken: bad, chatId: "1", text: "x" });
      }
    }
  });
  test("telegram messages.list sync: malformed botToken is INVALID_SYNC_INPUT with 0 fetches", async () => {
    for (const bad of BAD_TOKENS.filter((t) => t !== "")) {
      const result = await outcomeOf("telegram", "messages.list", { botToken: bad }, "sync");
      expect(result.code, JSON.stringify(bad)).toBe("INVALID_SYNC_INPUT");
      expect(result.calls).toEqual([]);
      expect(String(result.message ?? "")).not.toContain(bad.trim() || "\u0000");
    }
  });
  test("telegram sync trims the token like token.ts before using it as the path segment", async () => {
    const result = await outcomeOf("telegram", "messages.list", { botToken: " 123456:AA-b_c\t" }, "sync");
    expect(result.calls.map((c) => new URL(c.url).pathname)).toEqual(["/bot123456:AA-b_c/getUpdates"]);
  });
  test("valid values still reach the provider host", async () => {
    const hosts = async (connector: string, input: Record<string, unknown>) =>
      (await outcomeOf(connector, "", input, "healthcheck")).calls.map((c) => new URL(c.url).host);
    expect(await hosts("bamboohr", { apiKey: SECRET, companyDomain: "Acme" })).toContain("acme.bamboohr.com");
    expect(await hosts("confluence", { site: "Acme.Atlassian.net", email: "a@b.co", apiToken: SECRET })).toContain("acme.atlassian.net");
    expect(await hosts("docusign", { accessToken: SECRET, restHost: "demo.docusign.net", oauthHost: "account-d.docusign.com" })).toContain("demo.docusign.net");
    expect(await hosts("telegram", { botToken: "123456:AA-b_c" })).toContain("api.telegram.org");
  });
});
