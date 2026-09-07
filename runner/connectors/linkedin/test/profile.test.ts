import { describe, expect, it } from "bun:test";
import { normalizeProfile, parseProfileResponse } from "../src/profile";
import profileFixture from "../fixtures/profile.json";
import emailFixture from "../fixtures/profile_email.json";

describe("normalizeProfile", () => {
  it("maps all profile fields", () => {
    const p = normalizeProfile(profileFixture as any);
    expect(p.id).toBe("li-profile:abc123def");
    expect(p.provider).toBe("linkedin");
    expect(p.providerProfileId).toBe("abc123def");
    expect(p.firstName).toBe("Jane");
    expect(p.lastName).toBe("Smith");
    expect(p.headline).toBe("Senior Product Manager at TechCo");
    expect(p.vanityName).toBe("janesmith");
    expect(p.avatarUrl).toBe("https://media.licdn.com/dms/image/C4E03AQFabc/photo.jpg");
    expect(p.industry).toBe("Technology");
    expect(p.modelVersion).toBe("2026-05-16");
  });

  it("handles missing fields gracefully", () => {
    const p = normalizeProfile({ id: "min" });
    expect(p.id).toBe("li-profile:min");
    expect(p.firstName).toBe("");
    expect(p.lastName).toBe("");
    expect(p.avatarUrl).toBe("");
    expect(p.email).toBe("");
  });

  it("extracts email from email address response", () => {
    const p = normalizeProfile(emailFixture as any);
    expect(p.email).toBe("jane@techco.com");
  });
});

describe("parseProfileResponse", () => {
  it("returns normalized profile", () => {
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
