import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("linkedin manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("linkedin");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with OpenID Connect scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toEqual([
      "openid",
      "profile",
      "email",
      "w_member_social",
      "r_organization_social",
      "r_organization_admin",
    ]);
  });

  it("no longer declares legacy Sign In with LinkedIn scopes", () => {
    expect(manifest.auth.scopes).not.toContain("r_liteprofile");
    expect(manifest.auth.scopes).not.toContain("r_emailaddress");
    expect(JSON.stringify(manifest)).not.toContain("r_liteprofile");
    expect(JSON.stringify(manifest)).not.toContain("r_emailaddress");
  });

  it("allows linkedin hosts", () => {
    expect(manifest.network.allowedHosts).toContain("api.linkedin.com");
    expect(manifest.network.allowedHosts).toContain("www.linkedin.com");
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("profile.get");
    expect(ops).toContain("posts.list");
    expect(ops).toContain("organizations.list");
    expect(ops).toContain("posts.create");
    expect(ops).toContain("healthcheck");
    expect(ops).toContain("posts.publish");
    expect(ops).toContain("profile.whoami");
    expect(ops).toHaveLength(30);
  });

  it("posts.create is member-only and never defaults to urn:li:person:me", () => {
    const op = (manifest.operations as Record<string, any>)["posts.create"];
    const text = JSON.stringify(op);
    expect(text.includes("urn:li:person:me")).toBe(false);
    expect(op.description).not.toMatch(/organization posts|member or organization/i);
    expect(op.inputSchema.properties.authorUrn.description).toContain("urn:li:person:{sub}");
    for (const key of ["effectPolicy", "reconcile", "observe", "sideEffect"]) expect(key in op).toBe(false);
    expect(manifest.auth.scopes).not.toContain("w_organization_social");
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["profile", "post", "organization"]);
  });
});
