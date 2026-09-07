import { describe, expect, it } from "bun:test";
import { normalizeOrganization, parseOrganizationsResponse } from "../src/organizations";
import orgsList from "../fixtures/organizations_list.json";

describe("normalizeOrganization", () => {
  const raw1 = orgsList.elements[0] as any;
  const raw2 = orgsList.elements[1] as any;

  it("maps all organization fields", () => {
    const o = normalizeOrganization(raw1);
    expect(o.id).toBe("li-org:555666777");
    expect(o.provider).toBe("linkedin");
    expect(o.providerOrgId).toBe("555666777");
    expect(o.name).toBe("TechCo Inc");
    expect(o.vanityName).toBe("techco");
    expect(o.description).toBe("Leading technology solutions provider");
    expect(o.logoUrl).toBe("https://media.licdn.com/dms/image/org-logo.jpg");
    expect(o.websiteUrl).toBe("https://techco.com");
    expect(o.industry).toBe("Technology");
    expect(o.employeeCount).toBe(500);
    expect(o.followerCount).toBe(25000);
    expect(o.modelVersion).toBe("2026-05-16");
  });

  it("handles org without optional fields", () => {
    const o = normalizeOrganization(raw2);
    expect(o.id).toBe("li-org:888999000");
    expect(o.name).toBe("Innovation Lab");
    expect(o.description).toBe("R&D and innovation consulting");
    expect(o.logoUrl).toBe("");
    expect(o.websiteUrl).toBe("");
    expect(o.employeeCount).toBe(25);
    expect(o.followerCount).toBe(1200);
  });

  it("handles minimal input", () => {
    const o = normalizeOrganization({ id: "urn:li:organization:1" });
    expect(o.id).toBe("li-org:1");
    expect(o.name).toBe("");
    expect(o.description).toBe("");
    expect(o.followerCount).toBe(0);
  });
});

describe("parseOrganizationsResponse", () => {
  it("parses organizations with paging", () => {
    const result = parseOrganizationsResponse(orgsList);
    expect(result.organizations).toHaveLength(2);
    expect(result.nextStart).toBe(10);
    expect(result.count).toBe(10);
  });

  it("handles null input", () => {
    const result = parseOrganizationsResponse(null);
    expect(result.organizations).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });
});
