import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  checkOrgBlock,
  checkOrgPublicMember,
  getOrganizationRole,
  getOrgInteractionLimits,
  listPublicOrgs,
  listUserOrgs,
  listUserOrgEvents,
  listOutsideCollaborators,
  listOrgEvents,
  listPublicOrgMembers,
  listOrgBlocks,
} from "../src/actions";
import {
  validateCheckOrgBlockInput,
  validateListOutsideCollaboratorsInput,
  validateListPublicOrgsInput,
} from "../src/orgs_reads";

const READS = [
  "orgs.blocks.check",
  "orgs.public_members.check",
  "orgs.organization_roles.get",
  "orgs.interaction_limits.get",
  "orgs.public.list",
  "users.orgs.list",
  "users.events.orgs.list",
  "orgs.outside_collaborators.list",
  "orgs.events.list",
  "orgs.public_members.list",
  "orgs.blocks.list",
] as const;

const user = { id: 1, login: "octocat", html_url: "https://github.com/octocat", type: "User" };
const org = { id: 2, login: "acme", html_url: "https://github.com/acme", description: "Acme" };
const event = { id: "9", type: "PushEvent", actor: { login: "octocat" }, repo: { name: "acme/app" }, public: true, created_at: "2026-05-01T00:00:00Z" };

describe("github organization reads", () => {
  test("version string is 0.35.0 and the new reads omit effect policy", () => {
    expect(manifest.version).toBe("0.35.0");
    expect(manifest.version).not.toBe("0.29.0");
    expect(READS).toHaveLength(11);
    expect(Object.keys(manifest.operations)).toHaveLength(350);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["orgs.list"].description).toContain("GET /user/orgs");
    expect(manifest.operations["repos.interaction_limits.get"].description).toContain("GET /repos/{owner}/{repo}/interaction-limits");
    expect(manifest.operations["GITHUB_GET_ORGANIZATION_CUSTOM_PROPERTY"]).toBeUndefined();
    expect(Object.keys(manifest.operations).some((key) => key.includes("custom_propert"))).toBe(false);
  });

  test("validates path segments and documented query values", () => {
    expect(validateCheckOrgBlockInput({ org: "acme", username: "octocat" })).toEqual({ org: "acme", username: "octocat" });
    expect(() => validateCheckOrgBlockInput({ org: "acme/team", username: "octocat" })).toThrow(/single path segment/);
    expect(validateListPublicOrgsInput({ since: 10, perPage: 30 })).toEqual({ since: 10, perPage: 30 });
    expect(validateListPublicOrgsInput(undefined)).toEqual({});
    expect(validateListPublicOrgsInput({ page: 2 })).toEqual({});
    expect(() => validateListPublicOrgsInput({ since: -1 })).toThrow(/since/);
    expect(validateListOutsideCollaboratorsInput({ org: "acme", filter: "2fa_disabled" }).filter).toBe("2fa_disabled");
    expect(() => validateListOutsideCollaboratorsInput({ org: "acme", filter: "admins" })).toThrow(/filter/);
  });

  test("checks treat 204 as yes and 404 as no", async () => {
    const blocked = await checkOrgBlock({
      accessToken: "t", org: "ac me", username: "octo cat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/ac%20me/blocks/octo%20cat");
        return new Response(null, { status: 204 });
      },
    });
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.username).toBe("octo cat");

    const unblocked = await checkOrgBlock({
      accessToken: "t", org: "acme", username: "octocat",
      fetch: async () => new Response("{}", { status: 404 }),
    });
    expect(unblocked.isBlocked).toBe(false);

    const member = await checkOrgPublicMember({
      accessToken: "t", org: "acme", username: "octocat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/public_members/octocat");
        return new Response(null, { status: 204 });
      },
    });
    expect(member.isPublicMember).toBe(true);

    const hidden = await checkOrgPublicMember({
      accessToken: "t", org: "acme", username: "octocat",
      fetch: async () => new Response("{}", { status: 404 }),
    });
    expect(hidden.isPublicMember).toBe(false);
  });

  test("the other nine map 404 to CONNECTOR_UPSTREAM_ERROR and read the documented paths", async () => {
    const role = await getOrganizationRole({
      accessToken: "t", org: "acme", roleId: 5,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/organization-roles/5");
        return new Response(JSON.stringify({ id: 5, name: "Auditor", permissions: ["read_org"], source: "Predefined", base_role: "read" }), { status: 200 });
      },
    });
    expect(role.role).toMatchObject({ id: 5, name: "Auditor", permissions: ["read_org"], source: "Predefined", baseRole: "read" });

    const limits = await getOrgInteractionLimits({
      accessToken: "t", org: "acme",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/interaction-limits");
        return new Response(JSON.stringify({ limit: "collaborators_only", origin: "organization", expires_at: "2026-06-01T00:00:00Z" }), { status: 200 });
      },
    });
    expect(limits.present).toBe(true);
    expect(limits.limits).toEqual({ limit: "collaborators_only", origin: "organization", expiresAt: "2026-06-01T00:00:00Z" });

    const emptyLimits = await getOrgInteractionLimits({
      accessToken: "t", org: "acme",
      fetch: async () => new Response("{}", { status: 200 }),
    });
    expect(emptyLimits.present).toBe(false);

    const publicOrgs = await listPublicOrgs({
      accessToken: "t", since: 1, perPage: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/organizations?since=1&per_page=2");
        return new Response(JSON.stringify([org]), { status: 200 });
      },
    });
    expect(publicOrgs.organizations[0].login).toBe("acme");

    const userOrgs = await listUserOrgs({
      accessToken: "t", username: "octo cat", perPage: 1, page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octo%20cat/orgs?per_page=1&page=2");
        return new Response(JSON.stringify([org]), { status: 200 });
      },
    });
    expect(userOrgs.organizations).toHaveLength(1);

    const userEvents = await listUserOrgEvents({
      accessToken: "t", username: "octocat", org: "acme",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octocat/events/orgs/acme");
        return new Response(JSON.stringify([event]), { status: 200 });
      },
    });
    expect(userEvents.events[0]).toMatchObject({ eventId: "9", type: "PushEvent", actor: "octocat", repo: "acme/app" });

    const collaborators = await listOutsideCollaborators({
      accessToken: "t", org: "acme", filter: "all",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/outside_collaborators?filter=all");
        return new Response(JSON.stringify([user]), { status: 200 });
      },
    });
    expect(collaborators.collaborators[0].login).toBe("octocat");

    const orgEvents = await listOrgEvents({
      accessToken: "t", org: "acme",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/events");
        return new Response(JSON.stringify([event]), { status: 200 });
      },
    });
    expect(orgEvents.events).toHaveLength(1);

    const members = await listPublicOrgMembers({
      accessToken: "t", org: "acme",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/public_members");
        return new Response(JSON.stringify([user]), { status: 200 });
      },
    });
    expect(members.members[0].login).toBe("octocat");

    const blocks = await listOrgBlocks({
      accessToken: "t", org: "acme",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/blocks");
        return new Response(JSON.stringify([user]), { status: 200 });
      },
    });
    expect(blocks.users[0].login).toBe("octocat");

    await expect(getOrganizationRole({
      accessToken: "t", org: "missing", roleId: 5,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub organization role was not found." });

    await expect(listOrgBlocks({
      accessToken: "t", org: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    await expect(listPublicOrgs({
      accessToken: "t",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = getOrgInteractionLimits({ org: "acme" });
    expect(result.action).toBe("orgs.interaction_limits.get");
    expect(result.validated).toEqual({ org: "acme" });
  });
});
