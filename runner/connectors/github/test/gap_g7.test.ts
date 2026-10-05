import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  createOrUpdateOrgPropertySchema,
  getRepoOidcCustomizationSub,
  listEnvironmentDeploymentProtectionRuleApps,
  listOrgVariableRepositories,
  removeOrgActionsSecretRepository,
  removeOrgVariableRepository,
  setOrgOidcCustomizationSub,
  setOrgVariableRepositories,
  setRepoOidcCustomizationSub,
  updateOrgPropertiesSchema,
  updateOrgPropertyValues,
  updateRepoPropertyValues,
} from "../src/actions";
import {
  validateSetOrgOidcCustomizationSubInput,
  validateSetRepoOidcCustomizationSubInput,
  validateCreateOrUpdateOrgPropertySchemaInput,
} from "../src/gap_g7";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write"; reconcile?: string }> = {
  "orgs.actions.oidc.customization.sub.set": {
    methodPath: "PUT /orgs/{org}/actions/oidc/customization/sub",
    sideEffect: "write",
    reconcile: "orgs.actions.oidc.customization.sub.get",
  },
  "actions.oidc.customization.sub.get": {
    methodPath: "GET /repos/{owner}/{repo}/actions/oidc/customization/sub",
    sideEffect: "read",
  },
  "actions.oidc.customization.sub.set": {
    methodPath: "PUT /repos/{owner}/{repo}/actions/oidc/customization/sub",
    sideEffect: "write",
    reconcile: "actions.oidc.customization.sub.get",
  },
  "actions.org_variables.repositories.list": {
    methodPath: "GET /orgs/{org}/actions/variables/{name}/repositories",
    sideEffect: "read",
  },
  "actions.org_variables.repositories.set": {
    methodPath: "PUT /orgs/{org}/actions/variables/{name}/repositories",
    sideEffect: "write",
  },
  "actions.org_variables.repositories.remove": {
    methodPath: "DELETE /orgs/{org}/actions/variables/{name}/repositories/{repository_id}",
    sideEffect: "write",
  },
  "actions.org_secrets.repositories.remove": {
    methodPath: "DELETE /orgs/{org}/actions/secrets/{secret_name}/repositories/{repository_id}",
    sideEffect: "write",
  },
  "orgs.properties.schema.update": {
    methodPath: "PATCH /orgs/{org}/properties/schema",
    sideEffect: "write",
  },
  "orgs.properties.schema.create_or_update": {
    methodPath: "PUT /orgs/{org}/properties/schema/{custom_property_name}",
    sideEffect: "write",
  },
  "orgs.properties.values.update": {
    methodPath: "PATCH /orgs/{org}/properties/values",
    sideEffect: "write",
  },
  "repos.properties.values.update": {
    methodPath: "PATCH /repos/{owner}/{repo}/properties/values",
    sideEffect: "write",
  },
  "repos.environments.deployment_protection_rules.apps.list": {
    methodPath: "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/apps",
    sideEffect: "read",
  },
};

type Seen = { url: string; method: string; body?: string };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined });
    if (typeof responses === "function") return responses();
    return responses[i++];
  };
  return { seen, fetch };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function empty(status: number) {
  return new Response(null, { status });
}

describe("github gap G7 OIDC properties org variable/secret repos", () => {
  test("version is 0.76.0 at 782 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.76.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(782);
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
    expect(kinds).toEqual({ action: 732, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 388, write: 329, absent: 15 });
  });

  test("the twelve G7 ops wire effects and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(12);
    let reconciles = 0;
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(meta.sideEffect);
      expect(String(op.description)).toContain(meta.methodPath.split(" ")[1]);
      if (meta.reconcile) {
        expect(op.effectPolicy).toBe("Reconcile");
        expect(op.reconcile).toBe(meta.reconcile);
        reconciles += 1;
      } else {
        expect(op.effectPolicy).toBeUndefined();
        expect(op.reconcile).toBeUndefined();
        expect(op.effect).toBeUndefined();
      }
    }
    expect(reconciles).toBe(2);
  });

  test("validators enforce OIDC keys and property valueType", () => {
    expect(validateSetOrgOidcCustomizationSubInput({
      org: "octo", includeClaimKeys: ["repo", "context"], useImmutableSubject: true,
    })).toEqual({ org: "octo", includeClaimKeys: ["repo", "context"], useImmutableSubject: true });
    expect(validateSetRepoOidcCustomizationSubInput({
      owner: "o", repo: "r", useDefault: false, includeClaimKeys: ["repo"],
    })).toMatchObject({ useDefault: false, includeClaimKeys: ["repo"] });
    expect(() => validateSetRepoOidcCustomizationSubInput({ owner: "o", repo: "r" })).toThrow(/useDefault/);
    expect(validateCreateOrUpdateOrgPropertySchemaInput({
      org: "octo", customPropertyName: "env", valueType: "string",
    })).toMatchObject({ customPropertyName: "env", valueType: "string" });
    expect(() => validateCreateOrUpdateOrgPropertySchemaInput({
      org: "octo", customPropertyName: "env", valueType: "blob",
    })).toThrow(/valueType/);
  });

  test("OIDC set/get and variable/secret repo selection wire bodies; DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const orgSet = recorder([json({}, 201)]);
    expect(await setOrgOidcCustomizationSub({
      accessToken: "t", fetch: orgSet.fetch, org: "octo", includeClaimKeys: ["repo"], useImmutableSubject: true,
    })).toMatchObject({ subject: { includeClaimKeys: ["repo"], useImmutableSubject: true } });
    expect(JSON.parse(orgSet.seen[0].body!)).toEqual({
      include_claim_keys: ["repo"], use_immutable_subject: true,
    });

    const repoGet = recorder([json({ use_default: true, include_claim_keys: ["repo"], use_immutable_subject: false })]);
    expect(await getRepoOidcCustomizationSub({
      accessToken: "t", fetch: repoGet.fetch, owner: "o", repo: "r",
    })).toMatchObject({ subject: { useDefault: true, includeClaimKeys: ["repo"], useImmutableSubject: false } });

    const repoSet = recorder([json({}, 201)]);
    await setRepoOidcCustomizationSub({
      accessToken: "t", fetch: repoSet.fetch, owner: "o", repo: "r", useDefault: false, includeClaimKeys: ["repo", "actor"],
    });
    expect(JSON.parse(repoSet.seen[0].body!)).toEqual({
      use_default: false, include_claim_keys: ["repo", "actor"],
    });

    const list = recorder([json({ total_count: 1, repositories: [{ id: 9, name: "r", full_name: "o/r", private: false }] })]);
    expect(await listOrgVariableRepositories({
      accessToken: "t", fetch: list.fetch, org: "octo", name: "ENV",
    })).toMatchObject({ totalCount: 1, repositories: [{ id: 9, name: "r" }] });

    const set = recorder([empty(204)]);
    await setOrgVariableRepositories({
      accessToken: "t", fetch: set.fetch, org: "octo", name: "ENV", selectedRepositoryIds: [1, 2],
    });
    expect(JSON.parse(set.seen[0].body!)).toEqual({ selected_repository_ids: [1, 2] });

    const missing = recorder([empty(404)]);
    await expect(removeOrgActionsSecretRepository({
      accessToken: "t", fetch: missing.fetch, org: "octo", secretName: "S", repositoryId: 3,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("property schema/values updates and deployment rule apps list", async () => {
    const bulk = recorder([json([{ property_name: "env", value_type: "string", required: true }])]);
    expect(await updateOrgPropertiesSchema({
      accessToken: "t", fetch: bulk.fetch, org: "octo",
      properties: [{ propertyName: "env", valueType: "string", required: true }],
    })).toMatchObject({ properties: [{ propertyName: "env", valueType: "string", required: true }] });
    expect(JSON.parse(bulk.seen[0].body!)).toEqual({
      properties: [{ property_name: "env", value_type: "string", required: true }],
    });

    const upsert = recorder([json({
      property_name: "tier", value_type: "single_select", required: false,
      allowed_values: ["a", "b"], values_editable_by: "org_actors",
    })]);
    expect(await createOrUpdateOrgPropertySchema({
      accessToken: "t", fetch: upsert.fetch, org: "octo", customPropertyName: "tier",
      valueType: "single_select", allowedValues: ["a", "b"], valuesEditableBy: "org_actors",
    })).toMatchObject({ property: { propertyName: "tier", valueType: "single_select" } });

    const orgVals = recorder([empty(204)]);
    await updateOrgPropertyValues({
      accessToken: "t", fetch: orgVals.fetch, org: "octo",
      repositoryNames: ["r1"], properties: [{ propertyName: "env", value: "prod" }],
    });
    expect(JSON.parse(orgVals.seen[0].body!)).toEqual({
      repository_names: ["r1"], properties: [{ property_name: "env", value: "prod" }],
    });

    const repoVals = recorder([empty(204)]);
    await updateRepoPropertyValues({
      accessToken: "t", fetch: repoVals.fetch, owner: "o", repo: "r",
      properties: [{ propertyName: "env", value: ["x", "y"] }],
    });
    expect(JSON.parse(repoVals.seen[0].body!)).toEqual({
      properties: [{ property_name: "env", value: ["x", "y"] }],
    });

    const apps = recorder([json({
      total_count: 1,
      available_custom_deployment_protection_rule_integrations: [
        { id: 7, slug: "gate", integration_url: "https://api.github.com/apps/gate", node_id: "A", name: "Gate" },
      ],
    })]);
    expect(await listEnvironmentDeploymentProtectionRuleApps({
      accessToken: "t", fetch: apps.fetch, owner: "o", repo: "r", environmentName: "prod",
    })).toMatchObject({ totalCount: 1, apps: [{ id: 7, slug: "gate", name: "Gate" }] });

    expect(removeOrgVariableRepository({ org: "octo", name: "ENV", repositoryId: 1 }))
      .toMatchObject({ action: "actions.org_variables.repositories.remove" });
  });
});
