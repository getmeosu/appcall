import { describe, expect, it } from "bun:test";
import { LINKEDIN_USERINFO_PATH, normalizeProfile, parseProfileResponse } from "../src/profile";
import userinfoFixture from "../fixtures/profile_userinfo.json";
import profileFixture from "../fixtures/profile.json";
import emailFixture from "../fixtures/profile_email.json";

describe("normalizeProfile (OpenID Connect /v2/userinfo)", () => {
  it("targets the OpenID userinfo endpoint", () => {
    expect(LINKEDIN_USERINFO_PATH).toBe("/v2/userinfo");
  });

  it("maps userinfo claims", () => {
    const p = normalizeProfile(userinfoFixture as any);
    expect(p.id).toBe("li-profile:abc123def");
    expect(p.provider).toBe("linkedin");
    expect(p.providerProfileId).toBe("abc123def");
    expect(p.firstName).toBe("Jane");
    expect(p.lastName).toBe("Smith");
    expect(p.email).toBe("jane@techco.com");
    expect(p.avatarUrl).toBe("https://media.licdn.com/dms/image/C4E03AQFabc/photo.jpg");
    expect(p.modelVersion).toBe("2026-05-16");
    expect(p.raw).toEqual(userinfoFixture as any);
  });

  it("prefers sub over a legacy id", () => {
    const p = normalizeProfile({ sub: "oidc-sub", id: "legacy-id" });
    expect(p.providerProfileId).toBe("oidc-sub");
    expect(p.id).toBe("li-profile:oidc-sub");
  });

  it("falls back to splitting name when given_name/family_name are absent", () => {
    const p = normalizeProfile({ sub: "s1", name: "Mary Ann Lee" });
    expect(p.firstName).toBe("Mary");
    expect(p.lastName).toBe("Ann Lee");
    const single = normalizeProfile({ sub: "s2", name: "Cher" });
    expect(single.firstName).toBe("Cher");
    expect(single.lastName).toBe("");
  });

  it("handles missing fields gracefully", () => {
    const p = normalizeProfile({ sub: "min" });
    expect(p.id).toBe("li-profile:min");
    expect(p.firstName).toBe("");
    expect(p.lastName).toBe("");
    expect(p.avatarUrl).toBe("");
    expect(p.email).toBe("");
  });
});

describe("normalizeProfile (legacy /v2/me compat parse)", () => {
  it("still maps legacy profile fields", () => {
    const p = normalizeProfile(profileFixture as any);
    expect(p.id).toBe("li-profile:abc123def");
    expect(p.providerProfileId).toBe("abc123def");
    expect(p.firstName).toBe("Jane");
    expect(p.lastName).toBe("Smith");
    expect(p.headline).toBe("Senior Product Manager at TechCo");
    expect(p.vanityName).toBe("janesmith");
    expect(p.avatarUrl).toBe("https://media.licdn.com/dms/image/C4E03AQFabc/photo.jpg");
    expect(p.industry).toBe("Technology");
  });

  it("handles a minimal legacy id", () => {
    const p = normalizeProfile({ id: "min" });
    expect(p.id).toBe("li-profile:min");
    expect(p.email).toBe("");
  });

  it("still extracts email from a legacy email address response", () => {
    const p = normalizeProfile(emailFixture as any);
    expect(p.email).toBe("jane@techco.com");
  });
});

describe("parseProfileResponse", () => {
  it("returns normalized userinfo profile", () => {
    const result = parseProfileResponse(userinfoFixture);
    expect(result).not.toBeNull();
    expect(result!.providerProfileId).toBe("abc123def");
    expect(result!.email).toBe("jane@techco.com");
  });

  it("returns normalized legacy profile", () => {
    const result = parseProfileResponse(profileFixture);
    expect(result).not.toBeNull();
    expect(result!.providerProfileId).toBe("abc123def");
  });

  it("returns null for invalid input", () => {
    expect(parseProfileResponse(null)).toBeNull();
    expect(parseProfileResponse("string")).toBeNull();
    expect(parseProfileResponse(42)).toBeNull();
  });
});
