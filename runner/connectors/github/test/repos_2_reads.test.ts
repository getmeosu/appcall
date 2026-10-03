import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import autolinkFixture from "../fixtures/repo_autolink.json";
import readmeFixture from "../fixtures/repo_readme.json";
import readmeDirFixture from "../fixtures/repo_readme_dir.json";
import subscriptionFixture from "../fixtures/repo_subscription.json";
import communityFixture from "../fixtures/repo_community_profile.json";
import limitsFixture from "../fixtures/repo_interaction_limits.json";
import advisoryFixture from "../fixtures/repo_security_advisory.json";
import licenseFixture from "../fixtures/repo_license.json";
import attestationsFixture from "../fixtures/org_attestation_repositories.json";
import {
  getRepoAutolink,
  getRepoReadme,
  getRepoReadmeForDir,
  getRepoSubscription,
  getRepoCommunityProfile,
  getRepoInteractionLimits,
  getRepoSecurityAdvisory,
  getRepoLicense,
  listOrgAttestationRepositories,
} from "../src/actions";
import {
  validateGetAutolinkInput,
  validateGetReadmeForDirInput,
  validateGetSecurityAdvisoryInput,
  validateListOrgAttestationRepositoriesInput,
} from "../src/repos_reads";

const READS = [
  "repos.autolinks.get",
  "repos.readme.get",
  "repos.readme.get_for_dir",
  "repos.subscription.get",
  "repos.community.profile.get",
  "repos.interaction_limits.get",
  "repos.security_advisories.get",
  "repos.license.get",
  "orgs.attestations.repositories.list",
] as const;

describe("github repos-2 repository metadata reads", () => {
  test("manifest wires exactly 9 reads with no effect meta", () => {
    expect(manifest.version).toBe("0.42.0");
    expect(Object.keys(manifest.operations).length).toBe(421);
    expect(READS).toHaveLength(9);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
  });

  test("validates repos-2 inputs", () => {
    expect(validateGetAutolinkInput({ owner: "acme", repo: "app", autolink_id: 9 }).autolinkId).toBe(9);
    expect(() => validateGetAutolinkInput({ owner: "acme", repo: "app", autolink_id: 0 })).toThrow(/autolink_id/);
    expect(validateGetReadmeForDirInput({ owner: "acme", repo: "app", dir: "docs/guide" }).dir).toBe("docs/guide");
    expect(() => validateGetReadmeForDirInput({ owner: "acme", repo: "app", dir: "../secrets" })).toThrow(/dir/);
    expect(validateGetSecurityAdvisoryInput({ owner: "acme", repo: "app", ghsa_id: "GHSA-abcd-efgh-ijkl" }).ghsaId).toBe("GHSA-abcd-efgh-ijkl");
    expect(() => validateGetSecurityAdvisoryInput({ owner: "acme", repo: "app", ghsa_id: "not-a-ghsa" })).toThrow(/GHSA/);
    expect(validateListOrgAttestationRepositoriesInput({ org: "acme", perPage: 10 }).org).toBe("acme");
    expect(() => validateListOrgAttestationRepositoriesInput({ org: "acme/team" })).toThrow(/single path segment/);
  });

  test("autolink, readme, and directory readme hit encoded paths", async () => {
    const autolink = await getRepoAutolink({
      accessToken: "t", owner: "acme", repo: "app", autolink_id: 209612,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/autolinks/209612");
        return new Response(JSON.stringify(autolinkFixture), { status: 200 });
      },
    });
    expect((autolink.autolink as Record<string, unknown>).keyPrefix).toBe("TICKET-");

    const readme = await getRepoReadme({
      accessToken: "t", owner: "acme", repo: "app", ref: "main",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/readme?ref=main");
        return new Response(JSON.stringify(readmeFixture), { status: 200 });
      },
    });
    expect((readme.readme as Record<string, unknown>).name).toBe("README.md");

    const nested = await getRepoReadmeForDir({
      accessToken: "t", owner: "acme", repo: "app", dir: "docs/guide",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/readme/docs/guide");
        return new Response(JSON.stringify(readmeDirFixture), { status: 200 });
      },
    });
    expect((nested.readme as Record<string, unknown>).path).toBe("docs/guide/README.md");

    const spaced = await getRepoReadmeForDir({
      accessToken: "t", owner: "acme", repo: "app", dir: "docs/my guide",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/readme/docs/my%20guide");
        return new Response(JSON.stringify(readmeDirFixture), { status: 200 });
      },
    });
    expect((spaced.readme as Record<string, unknown>).name).toBe("README.md");
  });

  test("subscription, community profile, interaction limits, advisory, and license", async () => {
    const subscription = await getRepoSubscription({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/subscription");
        return new Response(JSON.stringify(subscriptionFixture), { status: 200 });
      },
    });
    expect((subscription.subscription as Record<string, unknown>).subscribed).toBe(true);

    const profile = await getRepoCommunityProfile({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/community/profile");
        return new Response(JSON.stringify(communityFixture), { status: 200 });
      },
    });
    expect((profile.profile as Record<string, unknown>).healthPercentage).toBe(100);

    const limits = await getRepoInteractionLimits({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async () => new Response(JSON.stringify(limitsFixture), { status: 200 }),
    });
    expect(limits.present).toBe(true);
    expect((limits.limits as Record<string, unknown>).limit).toBe("collaborators_only");

    const none = await getRepoInteractionLimits({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async () => new Response(null, { status: 204 }),
    });
    expect(none.present).toBe(false);

    const advisory = await getRepoSecurityAdvisory({
      accessToken: "t", owner: "acme", repo: "app", ghsa_id: "GHSA-abcd-efgh-ijkl",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/security-advisories/GHSA-abcd-efgh-ijkl");
        return new Response(JSON.stringify(advisoryFixture), { status: 200 });
      },
    });
    expect((advisory.advisory as Record<string, unknown>).severity).toBe("medium");

    const license = await getRepoLicense({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/license");
        return new Response(JSON.stringify(licenseFixture), { status: 200 });
      },
    });
    expect(((license.license as Record<string, unknown>).license as Record<string, unknown>).spdxId).toBe("MIT");
  });

  test("org attestation repositories list and read 404s stay upstream", async () => {
    const listed = await listOrgAttestationRepositories({
      accessToken: "t", org: "acme", perPage: 10, page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/attestations/repositories?per_page=10&page=2");
        return new Response(JSON.stringify(attestationsFixture), { status: 200 });
      },
    });
    expect(listed.totalCount).toBe(1);
    expect(((listed.repositories as Array<Record<string, unknown>>)[0]).fullName).toBe("acme/app");

    await expect(getRepoReadme({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    await expect(getRepoLicense({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    await expect(listOrgAttestationRepositories({
      accessToken: "t", org: "missing",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
