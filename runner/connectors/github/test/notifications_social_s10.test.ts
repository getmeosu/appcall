import { describe, expect, test } from "bun:test";
import notificationsFixture from "../fixtures/notifications_list.json";
import teamsFixture from "../fixtures/teams_list.json";
import membersFixture from "../fixtures/team_members_list.json";
import repoFixture from "../fixtures/get_repo.json";
import {
  listNotifications,
  getNotification,
  markNotificationRead,
  markAllNotificationsRead,
  listOrgTeams,
  listTeamMembers,
  addTeamMembership,
  forkRepo,
  starRepo,
  unstarRepo,
} from "../src/actions";
import {
  normalizeGitHubNotification,
  normalizeGitHubTeam,
  validateListNotificationsInput,
  validateAddTeamMembershipInput,
  validateForkRepoInput,
} from "../src/notifications_social";

describe("github S10 notifications-orgs-social", () => {
  test("normalizes notification and team fixtures", () => {
    const note = normalizeGitHubNotification(notificationsFixture[0] as never);
    expect(note.id).toBe("gh-notification:1");
    expect(note.unread).toBe(true);
    expect(note.repository).toBe("acme/app");
    const team = normalizeGitHubTeam(teamsFixture[0] as never);
    expect(team.id).toBe("gh-team:42");
    expect(team.slug).toBe("platform");
  });

  test("validates S10 inputs", () => {
    expect(validateListNotificationsInput({ all: true, perPage: 10 }).all).toBe(true);
    expect(() => validateListNotificationsInput({ all: "yes" })).toThrow();
    expect(validateAddTeamMembershipInput({ org: "acme", teamSlug: "platform", username: "octocat", role: "member" }).role).toBe("member");
    expect(() => validateAddTeamMembershipInput({ org: "acme", teamSlug: "platform", username: "octocat", role: "admin" })).toThrow();
    expect(validateForkRepoInput({ owner: "acme", repo: "app", organization: "other" }).organization).toBe("other");
    expect(() => validateForkRepoInput({ owner: "acme" })).toThrow();
  });

  test("list and get notifications hit expected paths", async () => {
    const requests: Request[] = [];
    const listed = await listNotifications({
      accessToken: "t",
      all: true,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(notificationsFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/notifications?all=true");
    expect((listed.notifications as unknown[]).length).toBe(1);

    const got = await getNotification({
      accessToken: "t",
      threadId: "1",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/notifications/threads/1");
        return new Response(JSON.stringify(notificationsFixture[0]), { status: 200 });
      },
    });
    expect((got.notification as Record<string, unknown>).threadId).toBe("1");
  });

  test("mark_read patches a thread and mark_all_read puts /notifications", async () => {
    const readReqs: Request[] = [];
    const marked = await markNotificationRead({
      accessToken: "t",
      threadId: "1",
      fetch: async (input, init) => {
        readReqs.push(new Request(input, init));
        return new Response("", { status: 205 });
      },
    });
    expect(readReqs[0].method).toBe("PATCH");
    expect(readReqs[0].url).toBe("https://api.github.com/notifications/threads/1");
    expect(marked.unread).toBe(false);

    const allReqs: Request[] = [];
    const all = await markAllNotificationsRead({
      accessToken: "t",
      lastReadAt: "2026-05-16T00:00:00Z",
      fetch: async (input, init) => {
        allReqs.push(new Request(input, init));
        return new Response("", { status: 202 });
      },
    });
    expect(allReqs[0].method).toBe("PUT");
    expect(allReqs[0].url).toBe("https://api.github.com/notifications");
    expect(all.marked).toBe(true);
  });

  test("org teams list, members list, and membership add", async () => {
    const teams = await listOrgTeams({
      accessToken: "t",
      org: "acme",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/teams");
        return new Response(JSON.stringify(teamsFixture), { status: 200 });
      },
    });
    expect((teams.teams as unknown[]).length).toBe(1);

    const members = await listTeamMembers({
      accessToken: "t",
      org: "acme",
      teamSlug: "platform",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/teams/platform/members");
        return new Response(JSON.stringify(membersFixture), { status: 200 });
      },
    });
    expect((members.members as Array<{ login: string }>)[0].login).toBe("octocat");

    const reqs: Request[] = [];
    const added = await addTeamMembership({
      accessToken: "t",
      org: "acme",
      teamSlug: "platform",
      username: "octocat",
      role: "member",
      fetch: async (input, init) => {
        reqs.push(new Request(input, init));
        return new Response(JSON.stringify({ url: "https://api.github.com/memberships/1", role: "member", state: "active" }), { status: 200 });
      },
    });
    expect(reqs[0].method).toBe("PUT");
    expect(reqs[0].url).toBe("https://api.github.com/orgs/acme/teams/platform/memberships/octocat");
    expect(added.state).toBe("active");
  });

  test("fork, star, and unstar", async () => {
    const forked = await forkRepo({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      organization: "other",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        expect(req.method).toBe("POST");
        expect(req.url).toBe("https://api.github.com/repos/acme/app/forks");
        return new Response(JSON.stringify({ ...repoFixture, fork: true }), { status: 202 });
      },
    });
    expect((forked.repository as { fork: boolean }).fork).toBe(true);
    expect(forked.id).toBe(500000001);

    const starred = await starRepo({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        expect(req.method).toBe("PUT");
        expect(req.url).toBe("https://api.github.com/user/starred/acme/app");
        return new Response("", { status: 204 });
      },
    });
    expect(starred.starred).toBe(true);

    const unstarred = await unstarRepo({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        expect(req.method).toBe("DELETE");
        expect(req.url).toBe("https://api.github.com/user/starred/acme/app");
        return new Response("", { status: 204 });
      },
    });
    expect(unstarred.starred).toBe(false);

    await expect(starRepo({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
