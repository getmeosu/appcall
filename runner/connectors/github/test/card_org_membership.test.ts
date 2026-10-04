import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import orgFixture from "../fixtures/org_update.json";
import invitationFixture from "../fixtures/org_invitation.json";
import invitationsFixture from "../fixtures/org_invitations_list.json";
import membershipFixture from "../fixtures/org_membership.json";
import refFixture from "../fixtures/get_ref.json";
import {
  updateOrg,
  blockOrgUser,
  unblockOrgUser,
  listOrgInvitations,
  createOrgInvitation,
  cancelOrgInvitation,
  getOrgMembership,
  updateOrgMembership,
  removeOrgMembership,
  getSingleGitRef,
} from "../src/actions";
import {
  validateUpdateOrgInput,
  validateBlockOrgUserInput,
  validateUnblockOrgUserInput,
  validateListOrgInvitationsInput,
  validateCreateOrgInvitationInput,
  validateCancelOrgInvitationInput,
  validateGetOrgMembershipInput,
  validateUpdateOrgMembershipInput,
  validateRemoveOrgMembershipInput,
  validateGetGitRefInput,
} from "../src/card_org_membership";

const READS = ["orgs.invitations.list", "orgs.memberships.get", "git.ref.get"] as const;
const RECONCILE = [
  ["orgs.update", "orgs.get"],
  ["orgs.invitations.create", "orgs.invitations.list"],
  ["orgs.memberships.update", "orgs.memberships.get"],
] as const;
const IDEMPOTENT = ["orgs.blocks.block"] as const;
const DESTRUCTIVE = ["orgs.blocks.unblock", "orgs.invitations.cancel", "orgs.memberships.remove"] as const;
const EXISTING = ["orgs.get", "orgs.blocks.list", "orgs.blocks.check", "git.refs.get"] as const;

describe("github org membership writes and git.ref.get", () => {
  test("version is 0.45.0 at 443 ops and the write policies are wired", () => {
    expect(manifest.version).toBe("0.45.0");
    expect(Object.keys(manifest.operations)).toHaveLength(443);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const [key, reconcile] of RECONCILE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(reconcile);
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const key of IDEMPOTENT) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const key of DESTRUCTIVE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("destructive");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    expect(String(manifest.operations["orgs.blocks.unblock"].description)).toContain("404");
    expect(String(manifest.operations["orgs.invitations.cancel"].description)).toContain("404");
    expect(String(manifest.operations["git.ref.get"].description)).toContain("git/ref/{ref}");
    expect(String(manifest.operations["git.ref.get"].description)).toContain("This is not GET /repos/{owner}/{repo}/git/refs/{ref}");
    for (const key of EXISTING) {
      expect(manifest.operations[key]).toBeDefined();
    }
    expect(manifest.operations["orgs.block.block"]).toBeUndefined();
    expect(manifest.operations["orgs.block.list"]).toBeUndefined();
    expect(manifest.operations["git.refs.get"].sideEffect).toBe("read");
  });

  test("orgs.update PATCHes snake_case fields and drops extra fields", async () => {
    const dry = updateOrg({ org: "github", name: "GitHub Inc", twitterUsername: "github" });
    expect(dry.action).toBe("orgs.update");
    expect(dry.validated).toEqual({ org: "github", name: "GitHub Inc", twitterUsername: "github" });
    const requests: Request[] = [];
    const result = await updateOrg({
      accessToken: "t",
      org: "github",
      name: "GitHub Inc",
      twitterUsername: "github",
      billingEmail: "billing@github.com",
      membersCanCreateRepositories: false,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(orgFixture, 200);
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.github.com/orgs/github");
    expect(requests[0].headers.get("authorization")).toBe("Bearer t");
    expect(requests[0].headers.get("accept")).toBe("application/vnd.github+json");
    expect(JSON.parse(await requests[0].text())).toEqual({
      name: "GitHub Inc",
      twitter_username: "github",
      billing_email: "billing@github.com",
      members_can_create_repositories: false,
    });
    expect(result.organization).toEqual({
      login: "github",
      name: "GitHub Inc",
      description: "How people build software.",
      company: "GitHub",
      location: "San Francisco",
      email: "octocat@github.com",
      blog: "https://github.com/about",
    });
    expect(JSON.stringify(result.organization)).not.toContain("drop-me");
  });

  test("blocks.block is PUT with Content-Length 0 and unblock treats 404 as already unblocked", async () => {
    const requests: Request[] = [];
    const blocked = await blockOrgUser({
      accessToken: "t",
      org: "github",
      username: "octocat",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.github.com/orgs/github/blocks/octocat");
    expect(requests[0].headers.get("content-length")).toBe("0");
    expect(blocked.blocked).toBe(true);
    expect(blocked.username).toBe("octocat");

    const unblocked = await unblockOrgUser({
      accessToken: "t",
      org: "github",
      username: "octocat",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[1].method).toBe("DELETE");
    expect(requests[1].url).toBe("https://api.github.com/orgs/github/blocks/octocat");
    expect(unblocked.blocked).toBe(false);

    const already = await unblockOrgUser({
      accessToken: "t",
      org: "github",
      username: "octocat",
      fetch: async () => new Response("", { status: 404 }),
    });
    expect(already.blocked).toBe(false);
    expect(already.username).toBe("octocat");

    await expect(blockOrgUser({
      accessToken: "t",
      org: "missing",
      username: "octocat",
      fetch: async () => json({ message: "Not Found" }, 404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("invitations.list GET, create POST, and cancel DELETE with 404 as upstream", async () => {
    const requests: Request[] = [];
    const listed = await listOrgInvitations({
      accessToken: "t",
      org: "github",
      role: "direct_member",
      perPage: 30,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(invitationsFixture, 200);
      },
    });
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.github.com/orgs/github/invitations?role=direct_member&per_page=30");
    expect(listed.invitations).toEqual([{
      id: 1,
      login: "monalisa",
      email: "octocat@github.com",
      role: "direct_member",
      createdAt: "2016-11-30T18:00:00-08:00",
      inviter: "other_user",
    }]);
    expect(JSON.stringify(listed.invitations)).not.toContain("drop-me");

    const created = await createOrgInvitation({
      accessToken: "t",
      org: "github",
      email: "octocat@github.com",
      role: "direct_member",
      teamIds: [2, 3],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(invitationFixture, 201);
      },
    });
    expect(requests[1].method).toBe("POST");
    expect(requests[1].url).toBe("https://api.github.com/orgs/github/invitations");
    expect(JSON.parse(await requests[1].text())).toEqual({
      email: "octocat@github.com",
      role: "direct_member",
      team_ids: [2, 3],
    });
    expect((created.invitation as Record<string, unknown>).id).toBe(1);

    const cancelled = await cancelOrgInvitation({
      accessToken: "t",
      org: "github",
      invitationId: 1,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[2].method).toBe("DELETE");
    expect(requests[2].url).toBe("https://api.github.com/orgs/github/invitations/1");
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.invitationId).toBe(1);
    await expect(cancelOrgInvitation({
      accessToken: "t",
      org: "github",
      invitationId: 1,
      fetch: async () => json({ message: "Not Found" }, 404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("memberships.get GET, update PUT, and remove treats 404 as already gone", async () => {
    const requests: Request[] = [];
    const got = await getOrgMembership({
      accessToken: "t",
      org: "github",
      username: "octocat",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(membershipFixture, 200);
      },
    });
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.github.com/orgs/github/memberships/octocat");
    expect(got.membership).toEqual({
      url: "https://api.github.com/orgs/github/memberships/octocat",
      state: "active",
      role: "admin",
      user: "octocat",
      organization: "github",
    });
    expect(JSON.stringify(got.membership)).not.toContain("drop-me");

    const updated = await updateOrgMembership({
      accessToken: "t",
      org: "github",
      username: "octocat",
      role: "member",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(membershipFixture, 200);
      },
    });
    expect(requests[1].method).toBe("PUT");
    expect(requests[1].url).toBe("https://api.github.com/orgs/github/memberships/octocat");
    expect(JSON.parse(await requests[1].text())).toEqual({ role: "member" });
    expect((updated.membership as Record<string, unknown>).role).toBe("admin");

    const removed = await removeOrgMembership({
      accessToken: "t",
      org: "github",
      username: "octocat",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[2].method).toBe("DELETE");
    expect(requests[2].url).toBe("https://api.github.com/orgs/github/memberships/octocat");
    expect(removed.removed).toBe(true);
    expect(removed.username).toBe("octocat");

    const already = await removeOrgMembership({
      accessToken: "t",
      org: "github",
      username: "octocat",
      fetch: async () => new Response("", { status: 404 }),
    });
    expect(already.removed).toBe(true);
  });

  test("git.ref.get uses GET /git/ref/{ref} and is not git/refs", async () => {
    const requests: Request[] = [];
    const result = await getSingleGitRef({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      ref: "heads/main",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(refFixture, 200);
      },
    });
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/ref/heads/main");
    expect(requests[0].url).not.toContain("/git/refs/");
    expect(result.ref).toEqual({
      ref: "refs/heads/main",
      sha: "abc123def456abc123def456abc123def456abc1",
      url: "https://api.github.com/repos/acme/app/git/refs/heads/main",
    });

    const tagged = await getSingleGitRef({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      ref: "refs/tags/v1.0",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json({ ...refFixture, ref: "refs/tags/v1.0" }, 200);
      },
    });
    expect(requests[1].url).toBe("https://api.github.com/repos/acme/app/git/ref/tags/v1.0");
    expect((tagged.ref as Record<string, unknown>).ref).toBe("refs/tags/v1.0");
  });

  test("path segments stay single and a 429 is CONNECTOR_RATE_LIMITED", async () => {
    expect(validateUpdateOrgInput({ org: "github", name: "GitHub" })).toEqual({ org: "github", name: "GitHub" });
    expect(validateBlockOrgUserInput({ org: "github", username: "octocat" })).toEqual({ org: "github", username: "octocat" });
    expect(validateUnblockOrgUserInput({ org: "github", username: "octocat" })).toEqual({ org: "github", username: "octocat" });
    expect(validateListOrgInvitationsInput({ org: "github", role: "admin", perPage: 10 })).toEqual({
      org: "github",
      role: "admin",
      perPage: 10,
    });
    expect(validateCreateOrgInvitationInput({ org: "github", email: "a@b.co" })).toEqual({
      org: "github",
      email: "a@b.co",
    });
    expect(validateCreateOrgInvitationInput({ org: "github", invitee_id: 7 })).toEqual({
      org: "github",
      inviteeId: 7,
    });
    expect(validateCancelOrgInvitationInput({ org: "github", invitation_id: 4 })).toEqual({
      org: "github",
      invitationId: 4,
    });
    expect(validateGetOrgMembershipInput({ org: "github", username: "octocat" })).toEqual({
      org: "github",
      username: "octocat",
    });
    expect(validateUpdateOrgMembershipInput({ org: "github", username: "octocat", role: "admin" })).toEqual({
      org: "github",
      username: "octocat",
      role: "admin",
    });
    expect(validateRemoveOrgMembershipInput({ org: "github", username: "octocat" })).toEqual({
      org: "github",
      username: "octocat",
    });
    expect(validateGetGitRefInput({ owner: "acme", repo: "app", ref: "heads/main" })).toEqual({
      owner: "acme",
      repo: "app",
      ref: "heads/main",
    });
    expect(() => validateUpdateOrgInput({ org: "a/b" })).toThrow(/single path segment/);
    expect(() => validateBlockOrgUserInput({ org: "github", username: "a?b" })).toThrow(/single path segment/);
    expect(() => validateCreateOrgInvitationInput({ org: "github" })).toThrow(/email or invitee_id/);
    expect(() => validateCreateOrgInvitationInput({ org: "github", role: "owner", email: "a@b.co" })).toThrow(/role/);
    expect(() => validateUpdateOrgMembershipInput({ org: "github", username: "octocat", role: "owner" })).toThrow(/role/);
    expect(() => validateCancelOrgInvitationInput({ org: "github", invitationId: 0 })).toThrow(/invitation_id/);
    expect(() => validateGetGitRefInput({ owner: "acme", repo: "app", ref: "heads/main?x" })).toThrow(/query or fragment/);
    expect(updateOrg({ org: "github" }).validated).toEqual({ org: "github" });
    expect(blockOrgUser({ org: "github", username: "octocat" }).validated).toEqual({ org: "github", username: "octocat" });
    await expect(listOrgInvitations({
      accessToken: "t",
      org: "github",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

const PATHS: Record<string, string> = {
  "orgs.update": "PATCH /orgs/{org}",
  "orgs.blocks.block": "PUT /orgs/{org}/blocks/{username}",
  "orgs.blocks.unblock": "DELETE /orgs/{org}/blocks/{username}",
  "orgs.invitations.list": "GET /orgs/{org}/invitations",
  "orgs.invitations.create": "POST /orgs/{org}/invitations",
  "orgs.invitations.cancel": "DELETE /orgs/{org}/invitations/{invitation_id}",
  "orgs.memberships.get": "GET /orgs/{org}/memberships/{username}",
  "orgs.memberships.update": "PUT /orgs/{org}/memberships/{username}",
  "orgs.memberships.remove": "DELETE /orgs/{org}/memberships/{username}",
  "git.ref.get": "GET /repos/{owner}/{repo}/git/ref/{ref}",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
