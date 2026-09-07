import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("mailchimp manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("mailchimp");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
  });

  it("allows mailchimp wildcard host", () => {
    expect(manifest.network.allowedHosts).toContain("*.api.mailchimp.com");
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("contacts.list");
    expect(ops).toContain("audiences.list");
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("contacts.create");
    expect(ops).toContain("healthcheck");
    // new action operations
    expect(ops).toContain("lists.members.get");
    expect(ops).toContain("lists.members.update");
    expect(ops).toContain("lists.members.upsert");
    expect(ops).toContain("lists.members.delete");
    expect(ops).toContain("lists.members.tags.add");
    expect(ops).toContain("lists.create");
    expect(ops).toContain("lists.get");
    expect(ops).toContain("campaigns.create");
    expect(ops).toContain("campaigns.get");
    expect(ops).toContain("campaigns.send");
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["contact", "audience", "campaign"]);
  });
});
