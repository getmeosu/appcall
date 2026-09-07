import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Zoho Books manifest", () => {
  it("has correct key", () => expect(manifest.key).toBe("zoho-books"));
  it("has version 0.1.0", () => expect(manifest.version).toBe("0.1.0"));
  it("uses bun runtime", () => expect(manifest.runtime).toBe("bun"));
  it("requires oauth2 auth", () => expect(manifest.auth.type).toBe("oauth2"));
  it("allows books.zoho.com", () => expect(manifest.network.allowedHosts).toEqual(["books.zoho.com"]));
  it("declares models", () => {
    expect(manifest.models).toContain("invoice");
    expect(manifest.models).toContain("contact");
    expect(manifest.models).toContain("payment");
  });
});
