import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("linkedin manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("linkedin");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with scopes", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("r_liteprofile");
    expect(manifest.auth.scopes).toContain("r_emailaddress");
    expect(manifest.auth.scopes).toContain("w_member_social");
    expect(manifest.auth.scopes).toContain("r_organization_social");
    expect(manifest.auth.scopes).toContain("r_organization_admin");
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
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["profile", "post", "organization"]);
  });
});
