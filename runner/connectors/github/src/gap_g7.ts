import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// G7: OIDC sub claims, org variable/secret repo selection, custom properties, env rule apps.
// 12 ops (OIDC org get moved to G3). Reconcile: org+repo OIDC set → exact observes.

type Page = { perPage?: number; page?: number };
type OrgScope = { org: string };
type RepoScope = { owner: string; repo: string };

const VALUE_TYPES = ["string", "single_select", "multi_select", "true_false", "url"] as const;
const VALUES_EDITABLE_BY = ["org_actors", "org_and_repo_actors"] as const;

export type NormalizedOidcSubject = {
  includeClaimKeys: string[];
  useImmutableSubject: boolean;
};
export type NormalizedRepoOidcSubject = NormalizedOidcSubject & { useDefault: boolean };
export type NormalizedRepoSummary = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
};
export type NormalizedCustomPropertySchema = {
  propertyName: string;
  valueType: string;
  required: boolean;
  description: string;
  defaultValue: string | string[] | null;
  allowedValues: string[];
  valuesEditableBy: string;
  requireExplicitValues: boolean;
};
export type NormalizedCustomPropertyValue = { propertyName: string; value: string | string[] | null };
export type NormalizedDeploymentRuleApp = {
  id: number;
  slug: string;
  integrationUrl: string;
  nodeId: string;
  name: string;
};

// ─── validators ──────────────────────────────────────────────────────────────

export function validateSetOrgOidcCustomizationSubInput(input: unknown): OrgScope & {
  includeClaimKeys: string[];
  useImmutableSubject?: boolean;
} {
  if (!isRecord(input)) throw new Error("orgs.actions.oidc.customization.sub.set input must be an object");
  const out: OrgScope & { includeClaimKeys: string[]; useImmutableSubject?: boolean } = {
    org: segment(input.org, "org"),
    includeClaimKeys: stringList(input.includeClaimKeys ?? input.include_claim_keys, "includeClaimKeys"),
  };
  if (input.useImmutableSubject !== undefined || input.use_immutable_subject !== undefined) {
    const value = input.useImmutableSubject ?? input.use_immutable_subject;
    if (typeof value !== "boolean") throw new Error("useImmutableSubject must be a boolean");
    out.useImmutableSubject = value;
  }
  return out;
}

export function validateGetRepoOidcCustomizationSubInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("actions.oidc.customization.sub.get input must be an object");
  return repo(input);
}

export function validateSetRepoOidcCustomizationSubInput(input: unknown): RepoScope & {
  useDefault: boolean;
  includeClaimKeys?: string[];
  useImmutableSubject?: boolean;
} {
  if (!isRecord(input)) throw new Error("actions.oidc.customization.sub.set input must be an object");
  const useDefault = input.useDefault ?? input.use_default;
  if (typeof useDefault !== "boolean") throw new Error("useDefault must be a boolean");
  const out: RepoScope & {
    useDefault: boolean;
    includeClaimKeys?: string[];
    useImmutableSubject?: boolean;
  } = { ...repo(input), useDefault };
  if (input.includeClaimKeys !== undefined || input.include_claim_keys !== undefined) {
    out.includeClaimKeys = stringList(input.includeClaimKeys ?? input.include_claim_keys, "includeClaimKeys");
  }
  if (input.useImmutableSubject !== undefined || input.use_immutable_subject !== undefined) {
    const value = input.useImmutableSubject ?? input.use_immutable_subject;
    if (typeof value !== "boolean") throw new Error("useImmutableSubject must be a boolean");
    out.useImmutableSubject = value;
  }
  return out;
}

export function validateListOrgVariableRepositoriesInput(input: unknown): OrgScope & { name: string } & Page {
  if (!isRecord(input)) throw new Error("actions.org_variables.repositories.list input must be an object");
  return { org: segment(input.org, "org"), name: segment(input.name, "name"), ...page(input) };
}

export function validateSetOrgVariableRepositoriesInput(input: unknown): OrgScope & {
  name: string;
  selectedRepositoryIds: number[];
} {
  if (!isRecord(input)) throw new Error("actions.org_variables.repositories.set input must be an object");
  return {
    org: segment(input.org, "org"),
    name: segment(input.name, "name"),
    selectedRepositoryIds: requireIdList(
      input.selectedRepositoryIds ?? input.selected_repository_ids,
      "selectedRepositoryIds",
    ),
  };
}

export function validateRemoveOrgVariableRepositoryInput(input: unknown): OrgScope & {
  name: string;
  repositoryId: number;
} {
  if (!isRecord(input)) throw new Error("actions.org_variables.repositories.remove input must be an object");
  return {
    org: segment(input.org, "org"),
    name: segment(input.name, "name"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateRemoveOrgActionsSecretRepositoryInput(input: unknown): OrgScope & {
  secretName: string;
  repositoryId: number;
} {
  if (!isRecord(input)) throw new Error("actions.org_secrets.repositories.remove input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateUpdateOrgPropertiesSchemaInput(input: unknown): OrgScope & {
  properties: Array<Record<string, unknown>>;
} {
  if (!isRecord(input)) throw new Error("orgs.properties.schema.update input must be an object");
  return { org: segment(input.org, "org"), properties: propertySchemaList(input.properties) };
}

export function validateCreateOrUpdateOrgPropertySchemaInput(input: unknown): OrgScope & {
  customPropertyName: string;
  valueType: string;
  required?: boolean;
  defaultValue?: string | string[] | null;
  description?: string;
  allowedValues?: string[];
  valuesEditableBy?: string;
  requireExplicitValues?: boolean;
} {
  if (!isRecord(input)) throw new Error("orgs.properties.schema.create_or_update input must be an object");
  const valueType = input.valueType ?? input.value_type;
  if (typeof valueType !== "string" || !(VALUE_TYPES as readonly string[]).includes(valueType)) {
    throw new Error("valueType must be string, single_select, multi_select, true_false, or url");
  }
  const out: OrgScope & {
    customPropertyName: string;
    valueType: string;
    required?: boolean;
    defaultValue?: string | string[] | null;
    description?: string;
    allowedValues?: string[];
    valuesEditableBy?: string;
    requireExplicitValues?: boolean;
  } = {
    org: segment(input.org, "org"),
    customPropertyName: segment(input.customPropertyName ?? input.custom_property_name, "customPropertyName"),
    valueType,
  };
  if (input.required !== undefined) {
    if (typeof input.required !== "boolean") throw new Error("required must be a boolean");
    out.required = input.required;
  }
  if (input.defaultValue !== undefined || input.default_value !== undefined) {
    out.defaultValue = optionalDefault(input.defaultValue ?? input.default_value);
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") throw new Error("description must be a string");
    out.description = input.description;
  }
  if (input.allowedValues !== undefined || input.allowed_values !== undefined) {
    const raw = input.allowedValues ?? input.allowed_values;
    if (raw === null) out.allowedValues = undefined;
    else out.allowedValues = stringListAllowEmpty(raw, "allowedValues");
  }
  if (input.valuesEditableBy !== undefined || input.values_editable_by !== undefined) {
    const value = input.valuesEditableBy ?? input.values_editable_by;
    if (typeof value !== "string" || !(VALUES_EDITABLE_BY as readonly string[]).includes(value)) {
      throw new Error("valuesEditableBy must be org_actors or org_and_repo_actors");
    }
    out.valuesEditableBy = value;
  }
  if (input.requireExplicitValues !== undefined || input.require_explicit_values !== undefined) {
    const value = input.requireExplicitValues ?? input.require_explicit_values;
    if (typeof value !== "boolean") throw new Error("requireExplicitValues must be a boolean");
    out.requireExplicitValues = value;
  }
  return out;
}

export function validateUpdateOrgPropertyValuesInput(input: unknown): OrgScope & {
  repositoryNames: string[];
  properties: NormalizedCustomPropertyValue[];
} {
  if (!isRecord(input)) throw new Error("orgs.properties.values.update input must be an object");
  return {
    org: segment(input.org, "org"),
    repositoryNames: stringList(input.repositoryNames ?? input.repository_names, "repositoryNames"),
    properties: propertyValueList(input.properties),
  };
}

export function validateUpdateRepoPropertyValuesInput(input: unknown): RepoScope & {
  properties: NormalizedCustomPropertyValue[];
} {
  if (!isRecord(input)) throw new Error("repos.properties.values.update input must be an object");
  return { ...repo(input), properties: propertyValueList(input.properties) };
}

export function validateListEnvironmentDeploymentProtectionRuleAppsInput(input: unknown): RepoScope & {
  environmentName: string;
} & Page {
  if (!isRecord(input)) {
    throw new Error("repos.environments.deployment_protection_rules.apps.list input must be an object");
  }
  return {
    ...repo(input),
    environmentName: requirePathText(input.environmentName ?? input.environment_name, "environmentName"),
    ...page(input),
  };
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG7Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async setOrgOidcCustomizationSub(input: unknown) {
      const payload = validateSetOrgOidcCustomizationSubInput(input);
      const body: Record<string, unknown> = { include_claim_keys: payload.includeClaimKeys };
      if (payload.useImmutableSubject !== undefined) body.use_immutable_subject = payload.useImmutableSubject;
      const response = await clientFor("orgs.actions.oidc.customization.sub.set").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/oidc/customization/sub`,
        jsonInit("PUT", body),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 201 || response.status === 200) {
        return {
          ok: true as const,
          subject: {
            includeClaimKeys: payload.includeClaimKeys,
            useImmutableSubject: payload.useImmutableSubject === true,
          },
        };
      }
      if (response.status === 404) return upstream("GitHub organization OIDC subject claim template was not found.");
      return upstream("GitHub rejected the orgs.actions.oidc.customization.sub.set request.");
    },

    async getRepoOidcCustomizationSub(input: unknown) {
      const payload = validateGetRepoOidcCustomizationSubInput(input);
      const result = await read(
        clientFor("actions.oidc.customization.sub.get"),
        `${repoPath(payload)}/actions/oidc/customization/sub`,
        "actions.oidc.customization.sub.get",
        "GitHub repository OIDC subject claim template was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the actions.oidc.customization.sub.get request.");
      return { ok: true as const, subject: normalizeRepoOidcSubject(result.body) };
    },

    async setRepoOidcCustomizationSub(input: unknown) {
      const payload = validateSetRepoOidcCustomizationSubInput(input);
      const body: Record<string, unknown> = { use_default: payload.useDefault };
      if (payload.includeClaimKeys !== undefined) body.include_claim_keys = payload.includeClaimKeys;
      if (payload.useImmutableSubject !== undefined) body.use_immutable_subject = payload.useImmutableSubject;
      const response = await clientFor("actions.oidc.customization.sub.set").fetchJSON(
        `${repoPath(payload)}/actions/oidc/customization/sub`,
        jsonInit("PUT", body),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 201 || response.status === 200) {
        return {
          ok: true as const,
          subject: {
            useDefault: payload.useDefault,
            includeClaimKeys: payload.includeClaimKeys ?? [],
            useImmutableSubject: payload.useImmutableSubject === true,
          },
        };
      }
      if (response.status === 404) return upstream("GitHub repository OIDC subject claim template was not found.");
      return upstream("GitHub rejected the actions.oidc.customization.sub.set request.");
    },

    async listOrgVariableRepositories(input: unknown) {
      const payload = validateListOrgVariableRepositoriesInput(input);
      const result = await read(
        clientFor("actions.org_variables.repositories.list"),
        `/orgs/${enc(payload.org)}/actions/variables/${enc(payload.name)}/repositories${qs(pageParams(payload))}`,
        "actions.org_variables.repositories.list",
        "GitHub organization variable repositories were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.repositories)) {
        return upstream("GitHub rejected the actions.org_variables.repositories.list request.");
      }
      const repositories = result.body.repositories.filter(isRecord).map(normalizeRepoSummary);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : repositories.length,
        repositories,
      };
    },

    async setOrgVariableRepositories(input: unknown) {
      const payload = validateSetOrgVariableRepositoriesInput(input);
      const response = await clientFor("actions.org_variables.repositories.set").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/variables/${enc(payload.name)}/repositories`,
        jsonInit("PUT", { selected_repository_ids: payload.selectedRepositoryIds }),
      );
      return noContent(
        response,
        204,
        { set: true, org: payload.org, name: payload.name, selectedRepositoryIds: payload.selectedRepositoryIds },
        "GitHub organization variable repositories were not found.",
        "GitHub rejected the actions.org_variables.repositories.set request.",
      );
    },

    async removeOrgVariableRepository(input: unknown) {
      const payload = validateRemoveOrgVariableRepositoryInput(input);
      const response = await clientFor("actions.org_variables.repositories.remove").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/variables/${enc(payload.name)}/repositories/${payload.repositoryId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { removed: true, org: payload.org, name: payload.name, repositoryId: payload.repositoryId },
        "GitHub organization variable repository was not found.",
        "GitHub rejected the actions.org_variables.repositories.remove request.",
      );
    },

    async removeOrgActionsSecretRepository(input: unknown) {
      const payload = validateRemoveOrgActionsSecretRepositoryInput(input);
      const response = await clientFor("actions.org_secrets.repositories.remove").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/secrets/${enc(payload.secretName)}/repositories/${payload.repositoryId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { removed: true, org: payload.org, secretName: payload.secretName, repositoryId: payload.repositoryId },
        "GitHub organization Actions secret repository was not found.",
        "GitHub rejected the actions.org_secrets.repositories.remove request.",
      );
    },

    async updateOrgPropertiesSchema(input: unknown) {
      const payload = validateUpdateOrgPropertiesSchemaInput(input);
      const response = await clientFor("orgs.properties.schema.update").fetchJSON(
        `/orgs/${enc(payload.org)}/properties/schema`,
        jsonInit("PATCH", { properties: payload.properties }),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && Array.isArray(response.body)) {
        return {
          ok: true as const,
          properties: response.body.filter(isRecord).map(normalizeCustomPropertySchema),
        };
      }
      if (response.status === 404) return upstream("GitHub organization property schemas were not found.");
      return upstream("GitHub rejected the orgs.properties.schema.update request.");
    },

    async createOrUpdateOrgPropertySchema(input: unknown) {
      const payload = validateCreateOrUpdateOrgPropertySchemaInput(input);
      const body: Record<string, unknown> = { value_type: payload.valueType };
      if (payload.required !== undefined) body.required = payload.required;
      if (payload.defaultValue !== undefined) body.default_value = payload.defaultValue;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.allowedValues !== undefined) body.allowed_values = payload.allowedValues;
      if (payload.valuesEditableBy !== undefined) body.values_editable_by = payload.valuesEditableBy;
      if (payload.requireExplicitValues !== undefined) body.require_explicit_values = payload.requireExplicitValues;
      const response = await clientFor("orgs.properties.schema.create_or_update").fetchJSON(
        `/orgs/${enc(payload.org)}/properties/schema/${enc(payload.customPropertyName)}`,
        jsonInit("PUT", body),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, property: normalizeCustomPropertySchema(response.body) };
      }
      if (response.status === 404) return upstream("GitHub organization property schema was not found.");
      return upstream("GitHub rejected the orgs.properties.schema.create_or_update request.");
    },

    async updateOrgPropertyValues(input: unknown) {
      const payload = validateUpdateOrgPropertyValuesInput(input);
      const response = await clientFor("orgs.properties.values.update").fetchJSON(
        `/orgs/${enc(payload.org)}/properties/values`,
        jsonInit("PATCH", {
          repository_names: payload.repositoryNames,
          properties: payload.properties.map((entry) => ({
            property_name: entry.propertyName,
            value: entry.value,
          })),
        }),
      );
      return noContent(
        response,
        204,
        { updated: true, org: payload.org, repositoryNames: payload.repositoryNames, properties: payload.properties },
        "GitHub organization property values were not found.",
        "GitHub rejected the orgs.properties.values.update request.",
      );
    },

    async updateRepoPropertyValues(input: unknown) {
      const payload = validateUpdateRepoPropertyValuesInput(input);
      const response = await clientFor("repos.properties.values.update").fetchJSON(
        `${repoPath(payload)}/properties/values`,
        jsonInit("PATCH", {
          properties: payload.properties.map((entry) => ({
            property_name: entry.propertyName,
            value: entry.value,
          })),
        }),
      );
      return noContent(
        response,
        204,
        { updated: true, owner: payload.owner, repo: payload.repo, properties: payload.properties },
        "GitHub repository property values were not found.",
        "GitHub rejected the repos.properties.values.update request.",
      );
    },

    async listEnvironmentDeploymentProtectionRuleApps(input: unknown) {
      const payload = validateListEnvironmentDeploymentProtectionRuleAppsInput(input);
      const result = await read(
        clientFor("repos.environments.deployment_protection_rules.apps.list"),
        `${repoPath(payload)}/environments/${enc(payload.environmentName)}/deployment_protection_rules/apps${qs(pageParams(payload))}`,
        "repos.environments.deployment_protection_rules.apps.list",
        "GitHub environment deployment protection rule apps were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) {
        return upstream("GitHub rejected the repos.environments.deployment_protection_rules.apps.list request.");
      }
      const raw = Array.isArray(result.body.available_custom_deployment_protection_rule_integrations)
        ? result.body.available_custom_deployment_protection_rule_integrations
        : null;
      if (!raw) {
        return upstream("GitHub rejected the repos.environments.deployment_protection_rules.apps.list request.");
      }
      const apps = raw.filter(isRecord).map(normalizeDeploymentRuleApp);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : apps.length,
        apps,
      };
    },
  };
}

// ─── normalizers ─────────────────────────────────────────────────────────────

function normalizeRepoOidcSubject(item: Record<string, unknown>): NormalizedRepoOidcSubject {
  return {
    useDefault: item.use_default === true,
    includeClaimKeys: Array.isArray(item.include_claim_keys)
      ? item.include_claim_keys.filter((entry): entry is string => typeof entry === "string")
      : [],
    useImmutableSubject: item.use_immutable_subject === true,
  };
}

function normalizeRepoSummary(item: Record<string, unknown>): NormalizedRepoSummary {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    fullName: typeof item.full_name === "string" ? item.full_name : "",
    private: item.private === true,
  };
}

function normalizeCustomPropertySchema(item: Record<string, unknown>): NormalizedCustomPropertySchema {
  const allowed = Array.isArray(item.allowed_values)
    ? item.allowed_values.filter((value): value is string => typeof value === "string")
    : [];
  let defaultValue: string | string[] | null = null;
  if (typeof item.default_value === "string") defaultValue = item.default_value;
  else if (Array.isArray(item.default_value)) {
    defaultValue = item.default_value.filter((value): value is string => typeof value === "string");
  }
  return {
    propertyName: typeof item.property_name === "string" ? item.property_name : "",
    valueType: typeof item.value_type === "string" ? item.value_type : "",
    required: item.required === true,
    description: typeof item.description === "string" ? item.description : "",
    defaultValue,
    allowedValues: allowed,
    valuesEditableBy: typeof item.values_editable_by === "string" ? item.values_editable_by : "",
    requireExplicitValues: item.require_explicit_values === true,
  };
}

function normalizeDeploymentRuleApp(item: Record<string, unknown>): NormalizedDeploymentRuleApp {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    slug: typeof item.slug === "string" ? item.slug : "",
    integrationUrl: typeof item.integration_url === "string" ? item.integration_url : "",
    nodeId: typeof item.node_id === "string" ? item.node_id : "",
    name: typeof item.name === "string" ? item.name : "",
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function read(client: GitHubClient, path: string, operation: string, missing: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(missing);
  if (response.status === 401) return upstream(`GitHub rejected the ${operation} request.`);
  if (response.status === 200) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return upstream(rejected);
}

function rate(status: number, headers: Record<string, string>) {
  const parsed = parseGitHubRateLimit(status, headers);
  if (!parsed.limited) return null;
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED" as const,
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: parsed.retryAfterSeconds,
    },
  };
}

function upstream(message: string) {
  return {
    ok: false as const,
    error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message, retryAfterSeconds: undefined as number | undefined },
  };
}

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function propertySchemaList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("properties must be a non-empty array");
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`properties[${index}] must be an object`);
    const propertyName = entry.propertyName ?? entry.property_name;
    const valueType = entry.valueType ?? entry.value_type;
    if (typeof propertyName !== "string" || propertyName.length === 0) {
      throw new Error(`properties[${index}].propertyName is required`);
    }
    if (typeof valueType !== "string" || !(VALUE_TYPES as readonly string[]).includes(valueType)) {
      throw new Error(`properties[${index}].valueType must be a valid value type`);
    }
    const body: Record<string, unknown> = { property_name: propertyName, value_type: valueType };
    if (entry.required !== undefined) {
      if (typeof entry.required !== "boolean") throw new Error(`properties[${index}].required must be a boolean`);
      body.required = entry.required;
    }
    if (entry.defaultValue !== undefined || entry.default_value !== undefined) {
      body.default_value = optionalDefault(entry.defaultValue ?? entry.default_value);
    }
    if (entry.description !== undefined) {
      if (typeof entry.description !== "string") throw new Error(`properties[${index}].description must be a string`);
      body.description = entry.description;
    }
    if (entry.allowedValues !== undefined || entry.allowed_values !== undefined) {
      body.allowed_values = stringListAllowEmpty(entry.allowedValues ?? entry.allowed_values, `properties[${index}].allowedValues`);
    }
    if (entry.valuesEditableBy !== undefined || entry.values_editable_by !== undefined) {
      const editable = entry.valuesEditableBy ?? entry.values_editable_by;
      if (typeof editable !== "string" || !(VALUES_EDITABLE_BY as readonly string[]).includes(editable)) {
        throw new Error(`properties[${index}].valuesEditableBy must be org_actors or org_and_repo_actors`);
      }
      body.values_editable_by = editable;
    }
    if (entry.requireExplicitValues !== undefined || entry.require_explicit_values !== undefined) {
      const flag = entry.requireExplicitValues ?? entry.require_explicit_values;
      if (typeof flag !== "boolean") throw new Error(`properties[${index}].requireExplicitValues must be a boolean`);
      body.require_explicit_values = flag;
    }
    return body;
  });
}

function propertyValueList(value: unknown): NormalizedCustomPropertyValue[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("properties must be a non-empty array");
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`properties[${index}] must be an object`);
    const propertyName = entry.propertyName ?? entry.property_name;
    if (typeof propertyName !== "string" || propertyName.length === 0) {
      throw new Error(`properties[${index}].propertyName is required`);
    }
    if (!("value" in entry)) throw new Error(`properties[${index}].value is required`);
    let parsed: string | string[] | null = null;
    if (entry.value === null) parsed = null;
    else if (typeof entry.value === "string") parsed = entry.value;
    else if (Array.isArray(entry.value)) {
      parsed = entry.value.filter((item): item is string => typeof item === "string");
    } else {
      throw new Error(`properties[${index}].value must be a string, string array, or null`);
    }
    return { propertyName, value: parsed };
  });
}

function optionalDefault(value: unknown): string | string[] | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) return value as string[];
  throw new Error("defaultValue must be a string, string array, or null");
}

function page(input: Record<string, unknown>): Page {
  const out: Page = {};
  if (input.perPage !== undefined || input.per_page !== undefined) {
    out.perPage = requireId(input.perPage ?? input.per_page, "perPage");
  }
  if (input.page !== undefined) out.page = requireId(input.page, "page");
  return out;
}

function pageParams(payload: Page): Record<string, string> {
  const params: Record<string, string> = {};
  if (payload.perPage !== undefined) params.per_page = String(payload.perPage);
  if (payload.page !== undefined) params.page = String(payload.page);
  return params;
}

function qs(params: Record<string, string>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "";
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
}

function repo(input: Record<string, unknown>): RepoScope {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${enc(payload.owner)}/${enc(payload.repo)}`;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireIdList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array of positive integers`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 1) {
      throw new Error(`${field}[${index}] must be a positive integer`);
    }
    return entry;
  });
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${field} must be a non-empty array of non-empty strings`);
  }
  return value as string[];
}

function stringListAllowEmpty(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value as string[];
}

function requirePathText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
