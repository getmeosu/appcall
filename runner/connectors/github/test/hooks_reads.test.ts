import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import hookFixture from "../fixtures/hook_get.json";
import configFixture from "../fixtures/hook_config.json";
import deliveryFixture from "../fixtures/hook_delivery.json";
import deliveriesFixture from "../fixtures/hook_deliveries.json";
import {
  getOrgHook,
  getRepoHook,
  getOrgHookConfig,
  getRepoHookConfig,
  getOrgHookDelivery,
  getRepoHookDelivery,
  listOrgHookDeliveries,
  listRepoHookDeliveries,
} from "../src/actions";
import {
  validateGetOrgHookInput,
  validateGetRepoHookInput,
  validateListOrgHookDeliveriesInput,
  validateListRepoHookDeliveriesInput,
  normalizeGitHubHookConfig,
} from "../src/governance";

const READS = [
  "orgs.hooks.get",
  "repos.hooks.get",
  "orgs.hooks.config.get",
  "repos.hooks.config.get",
  "orgs.hooks.deliveries.get",
  "repos.hooks.deliveries.get",
  "orgs.hooks.deliveries.list",
  "repos.hooks.deliveries.list",
] as const;

describe("github hook reads", () => {
  test("manifest stays v0.42.0 at 421 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.42.0");
    expect(Object.keys(manifest.operations).length).toBe(421);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["repos.hooks.list"].sideEffect).toBe("read");
    expect(manifest.operations["repos.hooks.create"].effectPolicy).toBe("Reconcile");
    expect(manifest.operations["orgs.hooks.create"]).toBeUndefined();
    expect(manifest.operations["orgs.hooks.delete"]).toBeUndefined();
    expect(manifest.operations["repos.hooks.delete"]).toBeUndefined();
  });

  test("validates ids, cursor pagination, and rejects page-style mistakes", () => {
    expect(validateGetOrgHookInput({ org: "acme", hookId: 7 })).toEqual({ org: "acme", hookId: 7 });
    expect(() => validateGetOrgHookInput({})).toThrow(/org is required/);
    expect(() => validateGetRepoHookInput({ owner: "acme", repo: "app", hookId: 0 })).toThrow(/hookId/);
    expect(validateListOrgHookDeliveriesInput({ org: "acme", hookId: 7, perPage: 100, cursor: "v1", status: "success" }).cursor).toBe("v1");
    expect(() => validateListOrgHookDeliveriesInput({ org: "acme", hookId: 7, perPage: 101 })).toThrow(/perPage/);
    expect(() => validateListRepoHookDeliveriesInput({ owner: "acme", repo: "app", hookId: 7, status: "pending" })).toThrow(/success or failure/);
    expect(() => validateListRepoHookDeliveriesInput({ owner: "acme", repo: "app", hookId: 7, cursor: "" })).toThrow(/cursor/);
    expect(validateListRepoHookDeliveriesInput({ owner: "acme", repo: "app", hookId: 7, page: 2 }).perPage).toBeUndefined();
  });

  test("gets an org hook and a repo hook with encoded path segments", async () => {
    const orgHook = await getOrgHook({
      accessToken: "t",
      org: "acme/org",
      hookId: 7,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme%2Forg/hooks/7");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return new Response(JSON.stringify(hookFixture), { status: 200 });
      },
    });
    expect(orgHook.action).toBe("orgs.hooks.get");
    expect(orgHook.hook).toEqual({
      id: "gh-hook:7",
      provider: "github",
      hookId: 7,
      name: "web",
      active: true,
      events: ["push", "pull_request"],
      url: "https://api.github.com/orgs/acme/hooks/7",
      configUrl: "https://example.com/hook",
      contentType: "json",
      modelVersion: "2026-05-16",
      raw: hookFixture,
    });

    const repoHook = await getRepoHook({
      accessToken: "t",
      owner: "octo cat",
      repo: "app/name",
      hookId: 7,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/app%2Fname/hooks/7");
        return new Response(JSON.stringify(hookFixture), { status: 200 });
      },
    });
    expect((repoHook.hook as { hookId: number }).hookId).toBe(7);
  });

  test("gets webhook config without promoting the secret", async () => {
    expect(normalizeGitHubHookConfig(configFixture).url).toBe("https://example.com/hook");
    const orgConfig = await getOrgHookConfig({
      accessToken: "t",
      org: "acme",
      hookId: 7,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/hooks/7/config");
        return new Response(JSON.stringify(configFixture), { status: 200 });
      },
    });
    expect(orgConfig.config).toEqual({
      url: "https://example.com/hook",
      contentType: "json",
      insecureSsl: "0",
      modelVersion: "2026-05-16",
      raw: configFixture,
    });
    expect((orgConfig.config as Record<string, unknown>).secret).toBeUndefined();

    const repoConfig = await getRepoHookConfig({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      hookId: 7,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/hooks/7/config");
        return new Response(JSON.stringify(configFixture), { status: 200 });
      },
    });
    expect((repoConfig.config as { contentType: string }).contentType).toBe("json");
  });

  test("gets one delivery and keeps a 404 as an upstream error", async () => {
    const delivery = await getRepoHookDelivery({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      hookId: 7,
      deliveryId: 12345678,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/hooks/7/deliveries/12345678");
        return new Response(JSON.stringify(deliveryFixture), { status: 200 });
      },
    });
    expect(delivery.delivery).toEqual({
      id: "gh-hook-delivery:12345678",
      provider: "github",
      deliveryId: 12345678,
      guid: "abc-guid",
      deliveredAt: "2026-05-16T00:00:00Z",
      redelivery: false,
      duration: 0.42,
      status: "OK",
      statusCode: 200,
      event: "push",
      action: "",
      modelVersion: "2026-05-16",
      raw: deliveryFixture,
    });

    const orgDelivery = await getOrgHookDelivery({
      accessToken: "t",
      org: "acme",
      hookId: 7,
      deliveryId: 12345678,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/hooks/7/deliveries/12345678");
        return new Response(JSON.stringify(deliveryFixture), { status: 200 });
      },
    });
    expect((orgDelivery.delivery as { guid: string }).guid).toBe("abc-guid");

    await expect(getOrgHook({
      accessToken: "t",
      org: "missing",
      hookId: 7,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoHookDeliveries({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      hookId: 7,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });

  test("lists deliveries with cursor and per_page, never page", async () => {
    const listed = await listRepoHookDeliveries({
      accessToken: "t",
      owner: "acme/org",
      repo: "app name",
      hookId: 7,
      perPage: 50,
      cursor: "v1_9",
      status: "failure",
      page: 2,
      fetch: async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/repos/acme%2Forg/app%20name/hooks/7/deliveries?per_page=50&cursor=v1_9&status=failure");
        expect(url).not.toMatch(/[?&]page=/);
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return new Response(JSON.stringify(deliveriesFixture), { status: 200 });
      },
    });
    expect(listed.action).toBe("repos.hooks.deliveries.list");
    expect((listed.deliveries as unknown[]).length).toBe(1);
    expect((listed.deliveries as { event: string }[])[0].event).toBe("push");

    const orgListed = await listOrgHookDeliveries({
      accessToken: "t",
      org: "octo/cat",
      hookId: 7,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%2Fcat/hooks/7/deliveries");
        return new Response(JSON.stringify(deliveriesFixture), { status: 200 });
      },
    });
    expect((orgListed.deliveries as unknown[]).length).toBe(1);
  });

  test("validation-only path does not fetch", () => {
    const result = getRepoHookConfig({ owner: "acme", repo: "app", hookId: 7 });
    expect(result.action).toBe("repos.hooks.config.get");
    expect(result.validated).toEqual({ owner: "acme", repo: "app", hookId: 7 });
  });
});
