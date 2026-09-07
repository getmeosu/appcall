import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Recruitee manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("recruitee");
  });

  it("has version 0.1.0", () => {
    expect(manifest.version).toBe("0.1.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("requires bearer auth", () => {
    expect(manifest.auth.type).toBe("bearer");
  });

  // Recruitee serves each customer from <company>.recruitee.com, so the host is
  // derived from tenant input. The wildcard is what keeps that input inside the
  // provider domain instead of letting it name an arbitrary host.
  it("allows recruitee subdomains and nothing else", () => {
    expect(manifest.network.allowedHosts).toEqual(["*.recruitee.com"]);
  });

  it("declares job model", () => {
    expect(manifest.models).toContain("job");
  });
});
