import { describe, expect, it } from "bun:test";
import adAccountCreate from "../fixtures/ad_account_create.json";
import leadFormCreate from "../fixtures/lead_form_create.json";
import networkSize from "../fixtures/network_size.json";
import organizationAcls from "../fixtures/organization_acls.json";
import pageStatistics from "../fixtures/organization_page_statistics.json";
import followerStatistics from "../fixtures/org_follower_statistics.json";
import shareStatistics from "../fixtures/org_share_statistics.json";
import conversionRules from "../fixtures/conversion_rules_list.json";
import dmpSegments from "../fixtures/dmp_segments_list.json";
import organizationsList from "../fixtures/organizations_list.json";
import postsList from "../fixtures/posts_list.json";
import organizationsLookup from "../fixtures/organizations_lookup.json";
import registerUpload from "../fixtures/register_upload.json";
import eventsSearch from "../fixtures/events_search.json";
import leadFormUpdate from "../fixtures/lead_form_update.json";
import organizationAclUpdate from "../fixtures/organization_acl_update.json";
import {
  createAdAccount,
  createLeadForm,
  getNetworkSize,
  getOrgFollowerStatistics,
  getOrganizationPageStatistics,
  getOrgShareStatistics,
  listConversionRules,
  listDmpSegments,
  listOrganizationAcls,
  listOrganizations,
  listPosts,
  lookupOrganizations,
  registerUpload as registerMediaUpload,
  searchEvents,
  updateLeadForm,
  updateOrganizationAcl,
} from "../src/parity-actions";

type Seen = { url: string; method?: string; body?: string; headers?: HeadersInit };

function mockFetch(status: number, body: unknown, seen?: (call: Seen) => void, extraHeaders?: Record<string, string>) {
  return (input: RequestInfo | URL, init: RequestInit = {}) => {
    seen?.({ url: String(input), method: init.method, body: typeof init.body === "string" ? init.body : undefined, headers: init.headers });
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(new Response(payload, {
      status,
      headers: { "content-type": "application/json", ...extraHeaders },
    }));
  };
}

const auth = { accessToken: "fixture-token" };

const leadContent = {
  questions: [
    {
      question: { localized: { en_US: "First Name" } },
      name: "firstName",
      questionDetails: { textQuestionDetails: {} },
      predefinedField: "FIRST_NAME",
    },
  ],
  headline: { localized: { en_US: "Talk with us" } },
};

describe("ad_accounts.create", () => {
  it("requires name, BUSINESS type, and a person or organization reference", () => {
    expect(() => createAdAccount({})).toThrow("name is required");
    expect(() => createAdAccount({ name: "Acme", type: "ENTERPRISE", reference: "urn:li:organization:1" })).toThrow("type must be BUSINESS");
    expect(() => createAdAccount({ name: "Acme", type: "BUSINESS", reference: "urn:li:company:1" })).toThrow("reference must be a person or organization URN");
  });

  it("keeps fixture mode credential free", () => {
    const out = createAdAccount({ name: "Acme", type: "BUSINESS", reference: "urn:li:organization:2414183", test: true }) as any;
    expect(out.action).toBe("ad_accounts.create");
    expect(out.adAccount).toBeNull();
    expect(out.validated.currency).toBe("USD");
  });

  it("POSTs a LinkedIn ad account and reads x-restli-id when the body is empty", async () => {
    let seen: Seen | undefined;
    const created = await createAdAccount({
      ...auth,
      name: "Acme Test Ads",
      type: "BUSINESS",
      reference: "urn:li:organization:2414183",
      test: true,
      currency: "USD",
      notifiedOnEndOfCampaign: true,
      fetch: mockFetch(201, "", (call) => { seen = call; }, { "x-restli-id": "512888001" }),
    }) as any;
    expect(seen?.method).toBe("POST");
    expect(new URL(seen!.url).pathname).toBe("/rest/adAccounts");
    const payload = JSON.parse(seen!.body!);
    expect(payload).toEqual({
      name: "Acme Test Ads",
      type: "BUSINESS",
      currency: "USD",
      reference: "urn:li:organization:2414183",
      test: true,
      notifiedOnEndOfCampaign: true,
    });
    expect(created.adAccount.id).toBe("512888001");

    const withBody = await createAdAccount({
      ...auth,
      name: "Acme Test Ads",
      type: "BUSINESS",
      reference: "urn:li:organization:2414183",
      fetch: mockFetch(201, adAccountCreate),
    }) as any;
    expect(withBody.adAccount.name).toBe("Acme Test Ads");
  });
});

describe("lead_forms.create", () => {
  const valid = {
    name: "Contact Us",
    owner: { sponsoredAccount: "urn:li:sponsoredAccount:77" },
    state: "DRAFT",
    creationLocale: { language: "en", country: "US" },
    content: leadContent,
  };

  it("requires owner union, locale, state, and content questions", () => {
    expect(() => createLeadForm({ ...valid, owner: {} })).toThrow("owner must include sponsoredAccount or organization");
    expect(() => createLeadForm({ ...valid, state: "LIVE" })).toThrow("state must be DRAFT, PUBLISHED, or ARCHIVED");
    expect(() => createLeadForm({ ...valid, content: { headline: {} } })).toThrow("content.questions");
  });

  it("POSTs a lead form body to /rest/leadForms", async () => {
    let seen: Seen | undefined;
    const out = await createLeadForm({
      ...auth,
      ...valid,
      hiddenFields: [{ name: "utm_source", value: "linkedin" }],
      fetch: mockFetch(201, leadFormCreate, (call) => { seen = call; }, { "x-restli-id": "6083" }),
    }) as any;
    expect(seen?.method).toBe("POST");
    expect(new URL(seen!.url).pathname).toBe("/rest/leadForms");
    const payload = JSON.parse(seen!.body!);
    expect(payload.owner).toEqual({ sponsoredAccount: "urn:li:sponsoredAccount:77" });
    expect(payload.hiddenFields).toEqual([{ name: "utm_source", value: "linkedin" }]);
    expect(out.leadForm.id).toBe(6083);
  });
});

describe("organizations.network_size.get", () => {
  it("encodes the organization URN on the Rest.li 2.0 path", async () => {
    let seen: Seen | undefined;
    const out = await getNetworkSize({
      ...auth,
      organization_urn: "urn:li:organization:2414183",
      fetch: mockFetch(200, networkSize, (call) => { seen = call; }),
    }) as any;
    const url = new URL(seen!.url);
    expect(url.pathname).toBe("/rest/networkSizes/urn%3Ali%3Aorganization%3A2414183");
    expect(url.searchParams.get("edgeType")).toBe("COMPANY_FOLLOWED_BY_MEMBER");
    expect(out.firstDegreeSize).toBe(21810);
    expect(out.networkSize.firstDegreeSize).toBe(21810);
  });

  it("rejects unsupported edge types and missing URNs", () => {
    expect(() => getNetworkSize({})).toThrow("organization_urn is required");
    expect(() => getNetworkSize({ organization_urn: "urn:li:organization:1", edge_type: "PERSON" })).toThrow("edge_type must be COMPANY_FOLLOWED_BY_MEMBER");
  });
});

describe("organizations.acls.list", () => {
  it("requires an organization URN when q=organization", () => {
    expect(() => listOrganizationAcls({ q: "organization" })).toThrow("organization is required");
    expect(() => listOrganizationAcls({ q: "member" })).toThrow("q must be organization or roleAssignee");
  });

  it("lists ACLs for an organization and for the authenticated assignee", async () => {
    let orgUrl = "";
    const org = await listOrganizationAcls({
      ...auth,
      q: "organization",
      organization: "urn:li:organization:2414183",
      role: "ADMINISTRATOR",
      state: "APPROVED",
      fetch: mockFetch(200, organizationAcls, (call) => { orgUrl = call.url; }),
    }) as any;
    const parsed = new URL(orgUrl);
    expect(parsed.pathname).toBe("/rest/organizationAcls");
    expect(parsed.searchParams.get("q")).toBe("organization");
    expect(parsed.searchParams.get("organization")).toBe("urn:li:organization:2414183");
    expect(parsed.searchParams.get("role")).toBe("ADMINISTRATOR");
    expect(org.acls[0].role).toBe("ADMINISTRATOR");

    let meUrl = "";
    await listOrganizationAcls({
      ...auth,
      q: "roleAssignee",
      fetch: mockFetch(200, organizationAcls, (call) => { meUrl = call.url; }),
    });
    expect(new URL(meUrl).searchParams.get("q")).toBe("roleAssignee");
  });
});

describe("organizations.page_statistics.get", () => {
  it("fetches lifetime stats and encodes timeIntervals when provided", async () => {
    let lifetime = "";
    const out = await getOrganizationPageStatistics({
      ...auth,
      organization: "urn:li:organization:2414183",
      fetch: mockFetch(200, pageStatistics, (call) => { lifetime = call.url; }),
    }) as any;
    const lifeUrl = new URL(lifetime);
    expect(lifeUrl.pathname).toBe("/rest/organizationPageStatistics");
    expect(lifeUrl.searchParams.get("q")).toBe("organization");
    expect(lifeUrl.searchParams.get("organization")).toBe("urn:li:organization:2414183");
    expect(lifeUrl.searchParams.get("timeIntervals.timeGranularityType")).toBeNull();
    expect(out.pageStatistics[0].organization).toBe("urn:li:organization:2414183");

    let bounded = "";
    await getOrganizationPageStatistics({
      ...auth,
      organization: "2414183",
      timeIntervals: { timeGranularityType: "DAY", timeRange: { start: 1704067200000, end: 1704153600000 } },
      fetch: mockFetch(200, pageStatistics, (call) => { bounded = call.url; }),
    });
    const boundedUrl = new URL(bounded);
    expect(boundedUrl.searchParams.get("timeIntervals.timeGranularityType")).toBe("DAY");
    expect(boundedUrl.searchParams.get("timeIntervals.timeRange.start")).toBe("1704067200000");
    expect(boundedUrl.searchParams.get("timeIntervals.timeRange.end")).toBe("1704153600000");
  });
});

describe("remaining Composio parity tools", () => {
  it("gets follower and share statistics for an organization", async () => {
    let followerUrl = "";
    const followers = await getOrgFollowerStatistics({
      ...auth,
      organizationalEntity: "urn:li:organization:2414183",
      fetch: mockFetch(200, followerStatistics, (call) => { followerUrl = call.url; }),
    }) as any;
    expect(new URL(followerUrl).pathname).toBe("/rest/organizationalEntityFollowerStatistics");
    expect(followers.followerStatistics[0].organizationalEntity).toBe("urn:li:organization:2414183");

    let shareUrl = "";
    const shares = await getOrgShareStatistics({
      ...auth,
      organizationalEntity: "urn:li:organization:2414183",
      shares: ["urn:li:share:1"],
      fetch: mockFetch(200, shareStatistics, (call) => { shareUrl = call.url; }),
    }) as any;
    expect(new URL(shareUrl).searchParams.get("shares")).toBe("List(urn:li:share:1)");
    expect(shares.shareStatistics[0].totalShareStatistics.clickCount).toBe(40);
  });

  it("lists conversion rules and DMP segments by account", async () => {
    let conversionUrl = "";
    const conversions = await listConversionRules({
      ...auth,
      account: "urn:li:sponsoredAccount:77",
      fetch: mockFetch(200, conversionRules, (call) => { conversionUrl = call.url; }),
    }) as any;
    expect(new URL(conversionUrl).pathname).toBe("/rest/conversions");
    expect(new URL(conversionUrl).searchParams.get("q")).toBe("account");
    expect(conversions.conversionRules[0].name).toBe("Signup");

    const segments = await listDmpSegments({
      ...auth,
      account: "77",
      q: "account",
      fetch: mockFetch(200, dmpSegments),
    }) as any;
    expect(segments.dmpSegments[0].id).toBe(44);
    expect(segments.nextStart).toBe(10);
  });

  it("lists, looks up organizations and lists posts by author", async () => {
    let vanityUrl = "";
    const orgs = await listOrganizations({
      ...auth,
      q: "vanityName",
      vanityName: "linkedin",
      fetch: mockFetch(200, organizationsList, (call) => { vanityUrl = call.url; }),
    }) as any;
    expect(new URL(vanityUrl).searchParams.get("q")).toBe("vanityName");
    expect(orgs.organizations[0].vanityName).toBe("linkedin");

    const lookedUp = await lookupOrganizations({
      ...auth,
      ids: [2414183, "2414183"],
      fetch: mockFetch(200, organizationsLookup),
    }) as any;
    expect(lookedUp.organizations[0].localizedName).toBe("LinkedIn");

    let postsUrl = "";
    const posts = await listPosts({
      ...auth,
      q: "author",
      author: "urn:li:organization:2414183",
      sort_by: "CREATED",
      fetch: mockFetch(200, postsList, (call) => { postsUrl = call.url; }),
    }) as any;
    expect(new URL(postsUrl).pathname).toBe("/rest/posts");
    expect(new URL(postsUrl).searchParams.get("author")).toBe("urn:li:organization:2414183");
    expect(new URL(postsUrl).searchParams.get("sortBy")).toBe("CREATED");
    expect(posts.posts[0].id).toContain("share:");
  });

  it("registers an assets upload, searches events, and patches a lead form", async () => {
    let uploadCall: Seen | undefined;
    const upload = await registerMediaUpload({
      ...auth,
      owner: "urn:li:organization:2414183",
      recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
      serviceRelationships: [{ identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" }],
      supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
      fetch: mockFetch(200, registerUpload, (call) => { uploadCall = call; }),
    }) as any;
    expect(new URL(uploadCall!.url).pathname).toBe("/rest/assets");
    expect(new URL(uploadCall!.url).searchParams.get("action")).toBe("registerUpload");
    expect(JSON.parse(uploadCall!.body!).registerUploadRequest.owner).toBe("urn:li:organization:2414183");
    expect(upload.upload.asset).toContain("digitalmediaAsset");

    const events = await searchEvents({
      ...auth,
      organizer: "urn:li:organization:2414183",
      q: "eventsByOrganizer",
      lifeCycleState: "UPCOMING",
      fetch: mockFetch(200, eventsSearch),
    }) as any;
    expect(events.events[0].name).toBe("Product launch");

    let patchCall: Seen | undefined;
    const updated = await updateLeadForm({
      ...auth,
      form_id: "f1",
      patch: { $set: { name: "Updated Demo", state: "PUBLISHED" } },
      fetch: mockFetch(204, "", (call) => { patchCall = call; }),
    }) as any;
    expect(patchCall?.method).toBe("POST");
    expect(new URL(patchCall!.url).pathname).toBe("/rest/leadForms/f1");
    expect(new Headers(patchCall!.headers).get("X-RestLi-Method")).toBe("PARTIAL_UPDATE");
    expect(JSON.parse(patchCall!.body!).patch.$set.name).toBe("Updated Demo");
    expect(updated.leadFormId).toBe("f1");
  });

  it("PUTs organization ACL requests on a Rest.li compound key", async () => {
    let seen: Seen | undefined;
    const out = await updateOrganizationAcl({
      ...auth,
      role: "DIRECT_SPONSORED_CONTENT_POSTER",
      state: "REQUESTED",
      organization: "urn:li:organization:2414183",
      roleAssignee: "urn:li:person:abc123",
      fetch: mockFetch(200, organizationAclUpdate, (call) => { seen = call; }),
    }) as any;
    expect(seen?.method).toBe("PUT");
    expect(new URL(seen!.url).pathname).toBe(
      "/rest/organizationAcls/(organization:urn%3Ali%3Aorganization%3A2414183,role:DIRECT_SPONSORED_CONTENT_POSTER,roleAssignee:urn%3Ali%3Aperson%3Aabc123)",
    );
    expect(out.acl.role).toBe("DIRECT_SPONSORED_CONTENT_POSTER");
  });

  it("maps provider 429s to CONNECTOR_RATE_LIMITED without leaking upstream bodies", async () => {
    let failure: any;
    try {
      await getNetworkSize({
        ...auth,
        organization_urn: "urn:li:organization:2414183",
        fetch: mockFetch(429, { secret: "never expose" }),
      });
    } catch (error) {
      failure = error;
    }
    expect(failure.code).toBe("CONNECTOR_RATE_LIMITED");
    expect(failure.message).not.toContain("never expose");
    expect(failure.retryAfterSeconds).toBe(30);
  });
});
