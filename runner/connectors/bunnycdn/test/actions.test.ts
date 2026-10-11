import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const root = dirname(fileURLToPath(import.meta.url));
const { actions } = compileDeclarativeConnector(manifest as never);
const expectedOps = [
  "healthcheck",
  "pullzones.list",
  "pullzones.get",
  "pullzones.purge",
  "storagezones.list",
  "pullzones.addAllowedReferer",
  "pullzones.addBlockedIp",
  "pullzones.addBlockedReferer",
  "storagezones.add",
  "pullzones.edgeRules.addOrUpdate",
  "dnszones.checkAvailability",
  "pullzones.checkAvailability",
  "storagezones.checkAvailability",
  "billing.coinify.create",
  "databases.create",
  "dnszones.records.create",
  "databases.groups.live",
  "pullzones.create",
  "shield.rateLimits.create",
  "shield.accessLists.create",
  "mc.registries.delete",
  "databases.delete",
  "dnszones.records.delete",
  "dnszones.delete",
  "pullzones.edgeRules.delete",
  "databases.groups.delete",
  "pullzones.delete",
  "shield.accessLists.delete",
  "storagezones.delete",
  "user.generate2fa",
  "databases.authTokens.generate",
  "billing.summary",
  "billing.coinify.exchangeRate",
  "mc.registries.configSuggestions",
  "mc.registries.digest",
  "databases.get",
  "databases.statistics",
  "dnszones.get",
  "dnszones.list",
  "databases.groups.get",
  "videolibraries.languages",
  "databases.limits",
  "stream.oembed",
  "mc.regions.optimal",
  "pullzones.optimizer.statistics",
  "pullzones.originShield.queueStatistics",
  "billing.preparePaymentAuthorization",
  "pullzones.safehop.statistics",
  "shield.botDetection.get",
  "shield.ddosEnums",
  "shield.eventLogs.get",
  "shield.metrics.botDetection",
  "shield.metrics.overview",
  "shield.metrics.overviewDetailed",
  "shield.metrics.rateLimit",
  "shield.metrics.rateLimits",
  "shield.metrics.uploadScanning",
  "shield.metrics.wafRule",
  "shield.promoState",
  "shield.rateLimits.get",
  "shield.rateLimits.list",
  "shield.zones.list",
  "shield.uploadScanning.get",
  "shield.waf.customRules.get",
  "shield.waf.customRules.list",
  "shield.waf.engineConfig",
  "shield.waf.enums",
  "shield.waf.profiles",
  "shield.waf.rules.planSegmentation",
  "shield.waf.rules.reviewTriggered",
  "shield.waf.rules.list",
  "shield.zones.get",
  "shield.accessLists.get",
  "shield.accessLists.enums",
  "shield.accessLists.list",
  "shield.zones.getByPullzone",
  "shield.zones.pullzoneMapping",
  "statistics.get",
  "storagezones.get",
  "user.audit",
  "user.get",
  "mc.limits",
  "user.whatsnew.list",
  "databases.authTokens.invalidate",
  "databases.groups.auth.invalidate",
  "apikeys.list",
  "mc.apps.list",
  "mc.registries.tags",
  "mc.registries.list",
  "countries.list",
  "databases.active",
  "databases.config",
  "databases.list",
  "databases.usage",
  "databases.versions",
  "compute.scripts.list",
  "databases.groups.list",
  "databases.groups.statistics",
  "databases.groups.usage",
  "mc.nodes.list",
  "user.notifications.list",
  "regions.list",
  "mc.regions.list",
  "videolibraries.list",
  "mc.volumes.list",
  "shield.waf.rules.reviewTriggered.apply",
  "purge.url",
  "pullzones.removeAllowedReferer",
  "pullzones.removeBlockedIp",
  "pullzones.removeBlockedReferer",
  "pullzones.resetSecurityKey",
  "user.whatsnew.reset",
  "databases.restore",
  "search.global",
  "mc.registries.publicImages.search",
  "pullzones.edgeRules.setEnabled",
  "pullzones.setForceSSL",
  "user.notifications.setOpened",
  "databases.update",
  "databases.groups.update",
  "pullzones.update",
  "shield.botDetection.update",
  "shield.rateLimits.update",
  "shield.zones.update",
  "shield.accessLists.update",
  "shield.accessLists.updateConfiguration",
  "shield.uploadScanning.update",
  "storagezones.update",
  "user.update",
  "pullzones.validateOriginUrl"
];

describe("bunnycdn composio parity", () => {
  it("compiles a request-backed handler for every operation", () => {
    expect(Object.keys(actions).sort()).toEqual([...expectedOps].sort());
    for (const op of expectedOps) {
      expect(actions[op], `${op} should compile`).toBeTypeOf("function");
      const operation = (manifest as any).operations[op];
      expect(operation.request, `${op} needs a request block`).toBeDefined();
      expect(operation.kind).toBe("action");
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });

  it("lists pull zones with AccessKey and optional search", async () => {
    const result = await actions["pullzones.list"]!({
      apiKey: "token",
      page: 1,
      perPage: 10,
      search: "edge",
      fetch: async (url: string, init?: RequestInit) => {
        const parsed = new URL(String(url));
        expect(parsed.origin + parsed.pathname).toBe("https://api.bunny.net/pullzone");
        expect(parsed.searchParams.get("page")).toBe("1");
        expect(parsed.searchParams.get("perPage")).toBe("10");
        expect(parsed.searchParams.get("search")).toBe("edge");
        expect(new Headers(init?.headers).get("AccessKey")).toBe("token");
        return new Response(JSON.stringify({ Items: [{ Id: 1, Name: "Edge" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(result).toMatchObject({ connector: "bunnycdn", action: "pullzones.list", source: "provider" });
  });

  it("posts documented pull-zone referer, purge-url, and Magic Container registry calls", async () => {
    await actions["pullzones.addAllowedReferer"]!({
      apiKey: "token",
      id: 1,
      Hostname: "example.com",
      fetch: async (url: string, init?: RequestInit) => {
        expect(String(url)).toBe("https://api.bunny.net/pullzone/1/addAllowedReferrer");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ Hostname: "example.com" });
        return new Response(null, { status: 204 });
      },
    });
    await actions["purge.url"]!({
      apiKey: "token",
      url: "https://origin.example.com/file.jpg",
      async_flag: true,
      fetch: async (url: string, init?: RequestInit) => {
        const parsed = new URL(String(url));
        expect(parsed.origin + parsed.pathname).toBe("https://api.bunny.net/purge");
        expect(parsed.searchParams.get("url")).toBe("https://origin.example.com/file.jpg");
        expect(parsed.searchParams.get("async")).toBe("true");
        expect(init?.method).toBe("POST");
        expect(init?.body ?? null).toBe(null);
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      },
    });
    await actions["mc.registries.digest"]!({
      apiKey: "token",
      tag: "latest",
      imageName: "nginx",
      registryId: "dockerhub",
      imageNamespace: "library",
      fetch: async (url: string, init?: RequestInit) => {
        expect(String(url)).toBe("https://api.bunny.net/mc/registries/digest");
        expect(JSON.parse(String(init?.body))).toEqual({
          tag: "latest",
          imageName: "nginx",
          registryId: "dockerhub",
          imageNamespace: "library",
        });
        return new Response(JSON.stringify({ digest: "sha256:abc" }), { status: 200 });
      },
    });
    await actions["stream.oembed"]!({
      apiKey: "token",
      url: "https://origin.example.com/file.jpg",
      fetch: async (url: string) => {
        const parsed = new URL(String(url));
        expect(parsed.origin).toBe("https://video.bunnycdn.com");
        expect(parsed.pathname).toBe("/OEmbed");
        expect(parsed.searchParams.get("url")).toBe("https://origin.example.com/file.jpg");
        return new Response(JSON.stringify({ type: "video", version: "1.0" }), { status: 200 });
      },
    });
    await actions["databases.get"]!({
      apiKey: "token",
      db_id: "db_01KHB7B3RQ1SP3KT6KRYHCAMRH",
      fetch: async (url: string) => {
        expect(String(url)).toBe("https://api.bunny.net/database/v1/databases/db_01KHB7B3RQ1SP3KT6KRYHCAMRH");
        return new Response(JSON.stringify({ id: "db_01KHB7B3RQ1SP3KT6KRYHCAMRH" }), { status: 200 });
      },
    });
  });

  it("rejects missing required fields before any HTTP call", async () => {
    await expect(actions["pullzones.get"]!({ apiKey: "token" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });

  it("runs every success fixture against the compiled connector", async () => {
    const casesDir = join(root, "../fixtures/cases");
    const files = readdirSync(casesDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(100);
    for (const file of files) {
      const c = JSON.parse(readFileSync(join(casesDir, file), "utf8"));
      if (c.expected?.kind !== "success" || !c.exchanges?.length) continue;
      const action = actions[c.operation];
      expect(action, `${c.id} missing handler`).toBeTypeOf("function");
      let index = 0;
      const result = await action({
        ...c.input,
        ...c.credentials,
        fetch: async (url: string, init?: RequestInit) => {
          const expected = c.exchanges[index++];
          expect(String(init?.method ?? "GET").toUpperCase()).toBe(expected.request.method.toUpperCase());
          const got = new URL(String(url));
          const want = new URL(expected.request.url);
          expect(got.origin + got.pathname).toBe(want.origin + want.pathname);
          const q = (u: URL) => [...u.searchParams.entries()].sort();
          expect(q(got)).toEqual(q(want));
          const body = init?.body == null ? null : String(init.body);
          expect(body).toBe(expected.request.body);
          const gotHeaders = new Headers(init?.headers);
          for (const [key, value] of Object.entries(expected.request.headers ?? {})) {
            expect(gotHeaders.get(key)).toBe(value);
          }
          const bodyPath = join(casesDir, expected.response.bodyFile);
          const bytes = readFileSync(bodyPath);
          return new Response(bytes, {
            status: expected.response.status,
            headers: expected.response.headers,
          });
        },
      });
      expect(index).toBe(c.exchanges.length);
      const expected = JSON.parse(readFileSync(join(casesDir, c.expected.resultFile), "utf8"));
      expect(result, c.id).toEqual(expected);
    }
  });

  it("rejects invalid fixture inputs without calling the network", async () => {
    const casesDir = join(root, "../fixtures/cases");
    const files = readdirSync(casesDir).filter((name) => name.endsWith(".json")).sort();
    let errors = 0;
    for (const file of files) {
      const c = JSON.parse(readFileSync(join(casesDir, file), "utf8"));
      if (c.expected?.kind !== "error") continue;
      errors += 1;
      await expect(actions[c.operation]!({ ...c.input, ...c.credentials, fetch: async () => {
        throw new Error(`network called for ${c.id}`);
      } })).rejects.toMatchObject({ code: c.expected.code });
    }
    expect(errors).toBeGreaterThan(80);
  });
});
