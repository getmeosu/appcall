import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/fly/recipe.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const COMPOSIO_OPS = [
  "wireguard.peers.add",
  "apps.check_name",
  "check_jobs.list",
  "tokens.user_only",
  "check_jobs.create",
  "check_jobs.run",
  "wireguard.delegated_tokens.create",
  "third_party_configurations.create",
  "wireguard.delegated_tokens.delete",
  "organizations.delete",
  "remote_builders.delete",
  "third_party_configurations.delete",
  "postgres.detach",
  "ssh.establish",
  "nodes.list",
  "add_ons.get",
  "add_ons.providers.get",
  "apps.details",
  "certificates.get",
  "tokens.current",
  "images.latest_details",
  "images.latest_tag",
  "machines.get_by_id",
  "regions.nearest",
  "nodes.get",
  "organizations.get",
  "organizations.personal",
  "platform.placements",
  "platform.info",
  "products.list",
  "platform.regions",
  "viewer.get",
  "ssh.issue_certificate",
  "add_ons.plans.list",
  "add_ons.list",
  "apps.list",
  "apps.list_graphql",
  "check_jobs.locations.list",
  "machines.list_graphql",
  "orgs.machines.list",
  "wireguard.peers.remove",
  "organizations.set_apps_v2_default",
  "third_party_configurations.update",
  "config.validate",
  "wireguard.peers.validate"
] as const;

describe("fly manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("fly");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.machines.dev/v1");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.network.allowedHosts).toEqual(["api.machines.dev", "api.fly.io"]);
    expect(manifest.provenance).toEqual({
      source: { url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" },
    });
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });

  it("gives every action a real request, title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(49);
    for (const toolOp of COMPOSIO_OPS) {
      expect(operations[toolOp], toolOp).toBeDefined();
    }
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(10);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect((operation.request as { path?: string }).path, key).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      const request = operation.request as { method?: string; baseUrl?: string; body?: { query?: string } };
      const host = new URL(String(request.baseUrl ?? manifest.http.baseUrl)).hostname;
      expect(["api.machines.dev", "api.fly.io"]).toContain(host);
      if (host === "api.fly.io") {
        expect(request.method).toBe("POST");
        expect(String(request.body?.query ?? "").length).toBeGreaterThan(5);
      }
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
