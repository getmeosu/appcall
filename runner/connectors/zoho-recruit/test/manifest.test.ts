import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Zoho Recruit manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("zoho-recruit");
  });

  it("has version 0.3.1", () => {
    expect(manifest.version).toBe("0.3.1");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("requires oauth2 auth", () => {
    expect(manifest.auth.type).toBe("oauth2");
  });

  it("allows only recruit.zoho.com plus the allowlisted non-US Recruit API hosts (ZR-0)", () => {
    expect(manifest.network.allowedHosts).toEqual([
      "recruit.zoho.com",
      "www.zohoapis.eu",
      "www.zohoapis.in",
      "www.zohoapis.com.au",
      "www.zohoapis.jp",
      "www.zohoapis.ca",
      "www.zohoapis.sa",
      "www.zohoapis.com.cn",
    ]);
  });

  it("declares one optional, non-secret dataCenter setup field and no host/baseUrl field", () => {
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.setup.fields.map((f: { key: string }) => f.key)).toEqual(["dataCenter"]);
    expect(manifest.auth.setup.fields[0]).toMatchObject({ key: "dataCenter", required: false, secret: false });
    expect(JSON.stringify(manifest.auth)).not.toMatch(/baseUrl|"host"|apiDomain|api_domain/);
  });

  it("declares P0 list syncs and P1 get/search/interviews", () => {
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.get"].kind).toBe("sync");
    expect(manifest.operations["candidates.search"].kind).toBe("sync");
    expect(manifest.operations["job_openings.list"].kind).toBe("sync");
    expect(manifest.operations["applications.list"].kind).toBe("sync");
    expect(manifest.operations["interviews.list"].kind).toBe("sync");
    expect(manifest.operations.healthcheck.kind).toBe("action");
    expect(Object.keys(manifest.operations)).toHaveLength(8);
  });

  it("declares job candidate job_opening application interview models", () => {
    expect(manifest.models).toEqual(["job", "candidate", "job_opening", "application", "interview"]);
  });
});
