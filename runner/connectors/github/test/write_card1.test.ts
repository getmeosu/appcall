import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  assignOrgRoleToUser,
  blockOrgUser,
  deleteOrg,
  removeAllOrgRolesFromUser,
  removeOrgMember,
  removeOrgRoleFromUser,
  deleteOrgPropertySchema,
  deleteOrgInteractionLimits,
  removeOutsideCollaborator,
  setOrgInteractionLimits,
  unblockOrgUser,
  unlockOrgMigrationRepo,
  updateOrg,
} from "../src/actions";
import { validateUpdateOrgInput } from "../src/write_card1";

const WRITES = [
  "orgs.organization_roles.users.assign",
  "orgs.blocks.block",
  "orgs.delete",
  "orgs.organization_roles.users.remove_all",
  "orgs.members.remove",
  "orgs.organization_roles.users.remove",
  "orgs.properties.schema.delete",
  "orgs.interaction_limits.delete",
  "orgs.outside_collaborators.remove",
  "orgs.interaction_limits.set",
  "orgs.blocks.unblock",
  "orgs.migrations.repos.unlock",
  "orgs.update",
] as const;

const NO_POLICY = WRITES.filter((key) => key !== "orgs.update");

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 1 org writes", () => {
  test("version is 0.68.0 at 685 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.68.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(685);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const op of Object.values(ops)) {
      kinds[op.kind as keyof typeof kinds] += 1;
      if (op.kind === "action") {
        if (op.sideEffect === "read") side.read += 1;
        else if (op.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 635, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 343, write: 277, absent: 15 });
    expect(String(ops["orgs.get"].description)).toContain("GET /orgs/{org}");
    expect(ops["orgs.get"].sideEffect).toBe("read");
    for (const key of NO_POLICY) {
      const op = ops[key];
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    const update = ops["orgs.update"];
    expect(update.kind).toBe("action");
    expect(update.sideEffect).toBe("write");
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("orgs.get");
    expect(update.inputSchema).not.toHaveProperty("properties.login");
    expect(JSON.stringify(update.inputSchema)).not.toContain('"login"');
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 delete is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };

    const assigned = await assignOrgRoleToUser({
      accessToken: token, org: "acme", username: "octo", roleId: 4,
      fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("PUT https://api.github.com/orgs/acme/organization-roles/users/octo/4 ");
    expect(assigned.assigned).toBe(true);
    await expect(assignOrgRoleToUser({ accessToken: token, org: "acme", username: "octo", roleId: 4, fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const blocked = await blockOrgUser({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(204) });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/orgs/acme/blocks/octo");
    expect(blocked.blocked).toBe(true);

    const deleted = await deleteOrg({ accessToken: token, org: "acme", fetch: fetchOf(202) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme ");
    expect(deleted.deleted).toBe(true);
    await expect(deleteOrg({ accessToken: token, org: "acme", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const removedAll = await removeAllOrgRolesFromUser({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/organization-roles/users/octo ");
    expect(removedAll.removed).toBe(true);
    await expect(removeAllOrgRolesFromUser({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const member = await removeOrgMember({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/members/octo ");
    expect(member.removed).toBe(true);
    await expect(removeOrgMember({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const role = await removeOrgRoleFromUser({ accessToken: token, org: "acme", username: "octo", roleId: 4, fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/organization-roles/users/octo/4 ");
    expect(role.removed).toBe(true);
    await expect(removeOrgRoleFromUser({ accessToken: token, org: "acme", username: "octo", roleId: 4, fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const property = await deleteOrgPropertySchema({ accessToken: token, org: "acme", customPropertyName: "env", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/properties/schema/env ");
    expect(property.deleted).toBe(true);
    await expect(deleteOrgPropertySchema({ accessToken: token, org: "acme", customPropertyName: "env", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const limitsDeleted = await deleteOrgInteractionLimits({ accessToken: token, org: "acme", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/interaction-limits ");
    expect(limitsDeleted.deleted).toBe(true);
    await expect(deleteOrgInteractionLimits({ accessToken: token, org: "acme", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const collaborator = await removeOutsideCollaborator({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/outside_collaborators/octo ");
    expect(collaborator.removed).toBe(true);
    await expect(removeOutsideCollaborator({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(removeOutsideCollaborator({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(422) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const limits = await setOrgInteractionLimits({
      accessToken: token, org: "acme", limit: "collaborators_only", expiry: "one_month",
      fetch: fetchOf(200, { limit: "collaborators_only", origin: "organization", expires_at: "2026-11-01T00:00:00Z" }),
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/orgs/acme/interaction-limits");
    expect(calls.at(-1)).toContain(JSON.stringify({ limit: "collaborators_only", expiry: "one_month" }));
    expect(limits.limits).toMatchObject({ limit: "collaborators_only" });

    const unblocked = await unblockOrgUser({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/blocks/octo ");
    expect(unblocked.unblocked).toBe(true);
    await expect(unblockOrgUser({ accessToken: token, org: "acme", username: "octo", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const unlocked = await unlockOrgMigrationRepo({ accessToken: token, org: "acme", migrationId: 9, repoName: "app", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/migrations/9/repos/app/lock ");
    expect(unlocked.unlocked).toBe(true);
    await expect(unlockOrgMigrationRepo({ accessToken: token, org: "acme", migrationId: 9, repoName: "app", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const updateCalls: string[] = [];
    const updated = await updateOrg({
      accessToken: token,
      org: "acme",
      name: "Acme Co",
      description: "widgets",
      fetch: async (input, init) => {
        updateCalls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
        return new Response(JSON.stringify({ id: 1, login: "acme", name: "Acme Co", description: "widgets" }), { status: 200 });
      },
    });
    expect(updateCalls).toEqual([
      `PATCH https://api.github.com/orgs/acme ${JSON.stringify({ name: "Acme Co", description: "widgets" })}`,
    ]);
    expect(JSON.parse(updateCalls[0].slice(updateCalls[0].indexOf("{")))).not.toHaveProperty("login");
    expect((updated.organization as { login: string; name: string }).login).toBe("acme");
    expect((updated.organization as { name: string }).name).toBe("Acme Co");
    expect(() => validateUpdateOrgInput({ org: "acme", login: "renamed" })).toThrow(/login/);
  });
});
