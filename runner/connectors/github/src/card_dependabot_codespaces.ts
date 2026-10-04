import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };
type Repo = { owner: string; repo: string };
type NamedSecret = Repo & { secretName: string };
type Org = { org: string };
type OrgSecret = Org & { secretName: string };
type CodespaceName = { codespaceName: string };

const DISMISS_REASONS = ["fix_started", "inaccurate", "no_bandwidth", "not_used", "tolerable_risk"] as const;
type DismissReason = (typeof DISMISS_REASONS)[number];
const VISIBILITIES = ["all", "private", "selected"] as const;
type Visibility = (typeof VISIBILITIES)[number];

export type GetDependabotAlertInput = Repo & { alertNumber: number };
export type UpdateDependabotAlertInput = GetDependabotAlertInput & {
  state: "open" | "dismissed";
  dismissedReason?: DismissReason;
  dismissedComment?: string;
};
export type ListOrgDependabotAlertsInput = Org & Page & { state?: string };
export type ListDependabotSecretsInput = Repo & Page;
export type GetDependabotSecretInput = NamedSecret;
export type CreateOrUpdateDependabotSecretInput = NamedSecret & { encryptedValue: string; keyId: string };
export type DeleteDependabotSecretInput = NamedSecret;
export type ListOrgDependabotSecretsInput = Org & Page;
export type GetOrgDependabotSecretInput = OrgSecret;
export type CreateOrUpdateOrgDependabotSecretInput = OrgSecret & {
  encryptedValue: string;
  keyId: string;
  visibility: Visibility;
  selectedRepositoryIds?: number[];
};
export type DeleteOrgDependabotSecretInput = OrgSecret;
export type GetDependabotRepoPublicKeyInput = Repo;
export type GetDependabotOrgPublicKeyInput = Org;
export type ListCodespacesForAuthenticatedUserInput = Page;
export type ListRepoCodespacesInput = Repo & Page;
export type GetCodespaceInput = CodespaceName;
export type CreateCodespaceForAuthenticatedUserInput = {
  repositoryId: number;
  ref?: string;
  machine?: string;
  displayName?: string;
  location?: string;
};
export type StartCodespaceInput = CodespaceName;
export type StopCodespaceInput = CodespaceName;
export type DeleteCodespaceInput = CodespaceName;
export type ListCodespaceMachinesInput = CodespaceName;
export type ListCodespacesSecretsInput = Page;

export type NormalizedDependabotAlert = {
  number: number;
  state: string;
  severity: string;
  packageName: string;
  manifestPath: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
};
export type NormalizedOrgDependabotAlert = NormalizedDependabotAlert & { repositoryFullName: string };
export type NormalizedNamedSecret = { name: string; created_at: string; updated_at: string };
export type NormalizedPublicKey = { key_id: string; key: string };
export type NormalizedCodespace = {
  id: number;
  name: string;
  state: string;
  machine: string;
  repositoryFullName: string;
};
export type NormalizedMachine = { name: string; displayName: string; os: string };

export function validateGetDependabotAlertInput(input: unknown): GetDependabotAlertInput {
  if (!isRecord(input)) throw new Error("dependabot.alerts.get input must be an object");
  return { ...repoScope(input), alertNumber: requireId(input.alertNumber, "alertNumber") };
}

export function validateUpdateDependabotAlertInput(input: unknown): UpdateDependabotAlertInput {
  if (!isRecord(input)) throw new Error("dependabot.alerts.update input must be an object");
  const state = input.state;
  if (state !== "open" && state !== "dismissed") throw new Error("state must be open or dismissed");
  const dismissedReason = typeof input.dismissedReason === "string" ? input.dismissedReason : undefined;
  if (state === "dismissed") {
    if (!dismissedReason || !DISMISS_REASONS.includes(dismissedReason as DismissReason)) {
      throw new Error("dismissedReason is required when state is dismissed");
    }
  } else if (dismissedReason !== undefined) {
    throw new Error("dismissedReason is only valid when state is dismissed");
  }
  return {
    ...validateGetDependabotAlertInput(input),
    state,
    dismissedReason: dismissedReason as DismissReason | undefined,
    dismissedComment: typeof input.dismissedComment === "string" ? input.dismissedComment : undefined,
  };
}

export function validateListOrgDependabotAlertsInput(input: unknown): ListOrgDependabotAlertsInput {
  if (!isRecord(input)) throw new Error("dependabot.org_alerts.list input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    state: typeof input.state === "string" ? input.state : undefined,
    ...pageInput(input),
  };
}

export function validateListDependabotSecretsInput(input: unknown): ListDependabotSecretsInput {
  if (!isRecord(input)) throw new Error("dependabot.secrets.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export function validateGetDependabotSecretInput(input: unknown): GetDependabotSecretInput {
  if (!isRecord(input)) throw new Error("dependabot.secrets.get input must be an object");
  return { ...repoScope(input), secretName: requireSingleSegment(input.secretName, "secretName") };
}

export function validateCreateOrUpdateDependabotSecretInput(input: unknown): CreateOrUpdateDependabotSecretInput {
  if (!isRecord(input)) throw new Error("dependabot.secrets.create_or_update input must be an object");
  return {
    ...validateGetDependabotSecretInput(input),
    encryptedValue: requireString(input.encryptedValue, "encryptedValue"),
    keyId: requireString(input.keyId, "keyId"),
  };
}

export function validateDeleteDependabotSecretInput(input: unknown): DeleteDependabotSecretInput {
  if (!isRecord(input)) throw new Error("dependabot.secrets.delete input must be an object");
  return validateGetDependabotSecretInput(input);
}

export function validateListOrgDependabotSecretsInput(input: unknown): ListOrgDependabotSecretsInput {
  if (!isRecord(input)) throw new Error("dependabot.org_secrets.list input must be an object");
  return { org: requireSingleSegment(input.org, "org"), ...pageInput(input) };
}

export function validateGetOrgDependabotSecretInput(input: unknown): GetOrgDependabotSecretInput {
  if (!isRecord(input)) throw new Error("dependabot.org_secrets.get input must be an object");
  return { org: requireSingleSegment(input.org, "org"), secretName: requireSingleSegment(input.secretName, "secretName") };
}

export function validateCreateOrUpdateOrgDependabotSecretInput(input: unknown): CreateOrUpdateOrgDependabotSecretInput {
  if (!isRecord(input)) throw new Error("dependabot.org_secrets.create_or_update input must be an object");
  const visibility = input.visibility;
  if (typeof visibility !== "string" || !VISIBILITIES.includes(visibility as Visibility)) {
    throw new Error("visibility must be all, private, or selected");
  }
  const selected = input.selectedRepositoryIds;
  let selectedRepositoryIds: number[] | undefined;
  if (selected !== undefined) {
    if (!Array.isArray(selected) || selected.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)) {
      throw new Error("selectedRepositoryIds must be an array of positive integers");
    }
    selectedRepositoryIds = selected;
  }
  return {
    ...validateGetOrgDependabotSecretInput(input),
    encryptedValue: requireString(input.encryptedValue, "encryptedValue"),
    keyId: requireString(input.keyId, "keyId"),
    visibility: visibility as Visibility,
    selectedRepositoryIds,
  };
}

export function validateDeleteOrgDependabotSecretInput(input: unknown): DeleteOrgDependabotSecretInput {
  if (!isRecord(input)) throw new Error("dependabot.org_secrets.delete input must be an object");
  return validateGetOrgDependabotSecretInput(input);
}

export function validateGetDependabotRepoPublicKeyInput(input: unknown): GetDependabotRepoPublicKeyInput {
  if (!isRecord(input)) throw new Error("dependabot.repo_public_key.get input must be an object");
  return repoScope(input);
}

export function validateGetDependabotOrgPublicKeyInput(input: unknown): GetDependabotOrgPublicKeyInput {
  if (!isRecord(input)) throw new Error("dependabot.org_public_key.get input must be an object");
  return { org: requireSingleSegment(input.org, "org") };
}

export function validateListCodespacesForAuthenticatedUserInput(input: unknown): ListCodespacesForAuthenticatedUserInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("codespaces.list_for_authenticated_user input must be an object");
  return pageInput(input);
}

export function validateListRepoCodespacesInput(input: unknown): ListRepoCodespacesInput {
  if (!isRecord(input)) throw new Error("codespaces.list_for_repo input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export function validateGetCodespaceInput(input: unknown): GetCodespaceInput {
  if (!isRecord(input)) throw new Error("codespaces.get input must be an object");
  return { codespaceName: requireSingleSegment(input.codespaceName, "codespaceName") };
}

export function validateCreateCodespaceForAuthenticatedUserInput(input: unknown): CreateCodespaceForAuthenticatedUserInput {
  if (!isRecord(input)) throw new Error("codespaces.create_for_authenticated_user input must be an object");
  return {
    repositoryId: requireId(input.repositoryId, "repositoryId"),
    ref: typeof input.ref === "string" ? input.ref : undefined,
    machine: typeof input.machine === "string" ? input.machine : undefined,
    displayName: typeof input.displayName === "string" ? input.displayName : undefined,
    location: typeof input.location === "string" ? input.location : undefined,
  };
}

export function validateStartCodespaceInput(input: unknown): StartCodespaceInput {
  if (!isRecord(input)) throw new Error("codespaces.start input must be an object");
  return validateGetCodespaceInput(input);
}

export function validateStopCodespaceInput(input: unknown): StopCodespaceInput {
  if (!isRecord(input)) throw new Error("codespaces.stop input must be an object");
  return validateGetCodespaceInput(input);
}

export function validateDeleteCodespaceInput(input: unknown): DeleteCodespaceInput {
  if (!isRecord(input)) throw new Error("codespaces.delete input must be an object");
  return validateGetCodespaceInput(input);
}

export function validateListCodespaceMachinesInput(input: unknown): ListCodespaceMachinesInput {
  if (!isRecord(input)) throw new Error("codespaces.machines.list input must be an object");
  return validateGetCodespaceInput(input);
}

export function validateListCodespacesSecretsInput(input: unknown): ListCodespacesSecretsInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("codespaces.secrets.list input must be an object");
  return pageInput(input);
}

export function normalizeDependabotAlert(item: Record<string, unknown>): NormalizedDependabotAlert {
  const dependency = isRecord(item.dependency) ? item.dependency : {};
  const pkg = isRecord(dependency.package) ? dependency.package : {};
  const advisory = isRecord(item.security_advisory) ? item.security_advisory : {};
  return {
    number: typeof item.number === "number" ? item.number : 0,
    state: typeof item.state === "string" ? item.state : "",
    severity: typeof advisory.severity === "string" ? advisory.severity : "",
    packageName: typeof pkg.name === "string" ? pkg.name : "",
    manifestPath: typeof dependency.manifest_path === "string" ? dependency.manifest_path : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizeOrgDependabotAlert(item: Record<string, unknown>): NormalizedOrgDependabotAlert {
  const repository = isRecord(item.repository) ? item.repository : {};
  return {
    ...normalizeDependabotAlert(item),
    repositoryFullName: typeof repository.full_name === "string" ? repository.full_name : "",
  };
}

export function normalizeNamedSecret(item: Record<string, unknown>): NormalizedNamedSecret {
  return {
    name: typeof item.name === "string" ? item.name : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizePublicKey(item: Record<string, unknown>): NormalizedPublicKey {
  return {
    key_id: typeof item.key_id === "string" ? item.key_id : "",
    key: typeof item.key === "string" ? item.key : "",
  };
}

export function normalizeCodespace(item: Record<string, unknown>): NormalizedCodespace {
  const machine = isRecord(item.machine) ? item.machine : {};
  const repository = isRecord(item.repository) ? item.repository : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    state: typeof item.state === "string" ? item.state : "",
    machine: typeof machine.name === "string" ? machine.name : "",
    repositoryFullName: typeof repository.full_name === "string" ? repository.full_name : "",
  };
}

export function normalizeMachine(item: Record<string, unknown>): NormalizedMachine {
  return {
    name: typeof item.name === "string" ? item.name : "",
    displayName: typeof item.display_name === "string" ? item.display_name : "",
    os: typeof item.operating_system === "string" ? item.operating_system : "",
  };
}

export function createDependabotCodespacesClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "dependabot.alerts.get",
  });

  return {
    async getAlert(input: unknown) {
      const payload = validateGetDependabotAlertInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/dependabot/alerts/${payload.alertNumber}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, alert: normalizeDependabotAlert(response.body) };
      }
      if (response.status === 404) return upstream("Dependabot alert not found.");
      return mapRateOrUpstream(response, "GitHub rejected the dependabot alert request.");
    },

    async updateAlert(input: unknown) {
      const payload = validateUpdateDependabotAlertInput(input);
      const body: Record<string, unknown> = { state: payload.state };
      if (payload.dismissedReason !== undefined) body.dismissed_reason = payload.dismissedReason;
      if (payload.dismissedComment !== undefined) body.dismissed_comment = payload.dismissedComment;
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/dependabot/alerts/${payload.alertNumber}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, alert: normalizeDependabotAlert(response.body) };
      }
      if (response.status === 404) return upstream("Dependabot alert not found.");
      return mapRateOrUpstream(response, "GitHub rejected the dependabot alert update.");
    },

    async listOrgAlerts(input: unknown) {
      const payload = validateListOrgDependabotAlertsInput(input);
      const response = await client.fetchJSON(
        `/orgs/${encodeURIComponent(payload.org)}/dependabot/alerts${query({
          state: payload.state,
          per_page: payload.perPage,
          page: payload.page,
        })}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, alerts: response.body.filter(isRecord).map(normalizeOrgDependabotAlert) };
      }
      if (response.status === 404) return upstream("Organization Dependabot alerts not found.");
      return mapRateOrUpstream(response, "GitHub rejected the organization Dependabot alerts request.");
    },

    async listSecrets(input: unknown) {
      const payload = validateListDependabotSecretsInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/dependabot/secrets${query(pageQuery(payload))}`,
      );
      return secretList(response, "Repository Dependabot secrets not found.", "GitHub rejected the Dependabot secrets list request.");
    },

    async getSecret(input: unknown) {
      const payload = validateGetDependabotSecretInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/dependabot/secrets/${encodeURIComponent(payload.secretName)}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, secret: normalizeNamedSecret(response.body) };
      }
      if (response.status === 404) return upstream("Dependabot secret not found.");
      return mapRateOrUpstream(response, "GitHub rejected the Dependabot secret request.");
    },

    async createOrUpdateSecret(input: unknown) {
      const payload = validateCreateOrUpdateDependabotSecretInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/dependabot/secrets/${encodeURIComponent(payload.secretName)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ encrypted_value: payload.encryptedValue, key_id: payload.keyId }),
        },
      );
      if (response.status === 201 || response.status === 204) {
        return { ok: true as const, secret: { name: payload.secretName, created: response.status === 201 } };
      }
      if (response.status === 404) return upstream("Dependabot secret not found.");
      return mapRateOrUpstream(response, "GitHub rejected the Dependabot secret create or update.");
    },

    async deleteSecret(input: unknown) {
      const payload = validateDeleteDependabotSecretInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/dependabot/secrets/${encodeURIComponent(payload.secretName)}`,
        { method: "DELETE" },
      );
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, secretName: payload.secretName };
      }
      if (response.status === 404) return upstream("Dependabot secret not found.");
      return mapRateOrUpstream(response, "GitHub rejected the Dependabot secret delete.");
    },

    async listOrgSecrets(input: unknown) {
      const payload = validateListOrgDependabotSecretsInput(input);
      const response = await client.fetchJSON(
        `/orgs/${encodeURIComponent(payload.org)}/dependabot/secrets${query(pageQuery(payload))}`,
      );
      return secretList(response, "Organization Dependabot secrets not found.", "GitHub rejected the organization Dependabot secrets list request.");
    },

    async getOrgSecret(input: unknown) {
      const payload = validateGetOrgDependabotSecretInput(input);
      const response = await client.fetchJSON(
        `/orgs/${encodeURIComponent(payload.org)}/dependabot/secrets/${encodeURIComponent(payload.secretName)}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, secret: normalizeNamedSecret(response.body) };
      }
      if (response.status === 404) return upstream("Organization Dependabot secret not found.");
      return mapRateOrUpstream(response, "GitHub rejected the organization Dependabot secret request.");
    },

    async createOrUpdateOrgSecret(input: unknown) {
      const payload = validateCreateOrUpdateOrgDependabotSecretInput(input);
      const body: Record<string, unknown> = {
        encrypted_value: payload.encryptedValue,
        key_id: payload.keyId,
        visibility: payload.visibility,
      };
      if (payload.selectedRepositoryIds !== undefined) body.selected_repository_ids = payload.selectedRepositoryIds;
      const response = await client.fetchJSON(
        `/orgs/${encodeURIComponent(payload.org)}/dependabot/secrets/${encodeURIComponent(payload.secretName)}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (response.status === 201 || response.status === 204) {
        return { ok: true as const, secret: { name: payload.secretName, created: response.status === 201 } };
      }
      if (response.status === 404) return upstream("Organization Dependabot secret not found.");
      return mapRateOrUpstream(response, "GitHub rejected the organization Dependabot secret create or update.");
    },

    async deleteOrgSecret(input: unknown) {
      const payload = validateDeleteOrgDependabotSecretInput(input);
      const response = await client.fetchJSON(
        `/orgs/${encodeURIComponent(payload.org)}/dependabot/secrets/${encodeURIComponent(payload.secretName)}`,
        { method: "DELETE" },
      );
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, secretName: payload.secretName };
      }
      if (response.status === 404) return upstream("Organization Dependabot secret not found.");
      return mapRateOrUpstream(response, "GitHub rejected the organization Dependabot secret delete.");
    },

    async getRepoPublicKey(input: unknown) {
      const payload = validateGetDependabotRepoPublicKeyInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/dependabot/secrets/public-key`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, publicKey: normalizePublicKey(response.body) };
      }
      if (response.status === 404) return upstream("Repository Dependabot public key not found.");
      return mapRateOrUpstream(response, "GitHub rejected the Dependabot repository public key request.");
    },

    async getOrgPublicKey(input: unknown) {
      const payload = validateGetDependabotOrgPublicKeyInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/dependabot/secrets/public-key`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, publicKey: normalizePublicKey(response.body) };
      }
      if (response.status === 404) return upstream("Organization Dependabot public key not found.");
      return mapRateOrUpstream(response, "GitHub rejected the Dependabot organization public key request.");
    },

    async listForAuthenticatedUser(input: unknown) {
      const payload = validateListCodespacesForAuthenticatedUserInput(input);
      const response = await client.fetchJSON(`/user/codespaces${query(pageQuery(payload))}`);
      return codespaceList(response, "Codespaces not found.", "GitHub rejected the list authenticated user codespaces request.");
    },

    async listForRepo(input: unknown) {
      const payload = validateListRepoCodespacesInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/codespaces${query(pageQuery(payload))}`,
      );
      return codespaceList(response, "Repository codespaces not found.", "GitHub rejected the list repository codespaces request.");
    },

    async getCodespace(input: unknown) {
      const payload = validateGetCodespaceInput(input);
      const response = await client.fetchJSON(`/user/codespaces/${encodeURIComponent(payload.codespaceName)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, codespace: normalizeCodespace(response.body) };
      }
      if (response.status === 404) return upstream("Codespace not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get codespace request.");
    },

    async createForAuthenticatedUser(input: unknown) {
      const payload = validateCreateCodespaceForAuthenticatedUserInput(input);
      const body: Record<string, unknown> = { repository_id: payload.repositoryId };
      if (payload.ref !== undefined) body.ref = payload.ref;
      if (payload.machine !== undefined) body.machine = payload.machine;
      if (payload.displayName !== undefined) body.display_name = payload.displayName;
      if (payload.location !== undefined) body.location = payload.location;
      const response = await client.fetchJSON("/user/codespaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if ((response.status === 201 || response.status === 202) && isRecord(response.body)) {
        return { ok: true as const, codespace: normalizeCodespace(response.body) };
      }
      if (response.status === 404) return upstream("Codespace repository not found.");
      return mapRateOrUpstream(response, "GitHub rejected the create codespace request.");
    },

    async start(input: unknown) {
      const payload = validateStartCodespaceInput(input);
      const response = await client.fetchJSON(`/user/codespaces/${encodeURIComponent(payload.codespaceName)}/start`, {
        method: "POST",
      });
      if (response.status === 304) {
        return {
          ok: true as const,
          codespace: { id: 0, name: payload.codespaceName, state: "Available", machine: "", repositoryFullName: "" },
        };
      }
      if ((response.status === 200 || response.status === 202) && isRecord(response.body)) {
        return { ok: true as const, codespace: normalizeCodespace(response.body) };
      }
      if (response.status === 404) return upstream("Codespace not found.");
      return mapRateOrUpstream(response, "GitHub rejected the start codespace request.");
    },

    async stop(input: unknown) {
      const payload = validateStopCodespaceInput(input);
      const response = await client.fetchJSON(`/user/codespaces/${encodeURIComponent(payload.codespaceName)}/stop`, {
        method: "POST",
      });
      if ((response.status === 200 || response.status === 202) && isRecord(response.body)) {
        return { ok: true as const, codespace: normalizeCodespace(response.body) };
      }
      if (response.status === 404) return upstream("Codespace not found.");
      return mapRateOrUpstream(response, "GitHub rejected the stop codespace request.");
    },

    async delete(input: unknown) {
      const payload = validateDeleteCodespaceInput(input);
      const response = await client.fetchJSON(`/user/codespaces/${encodeURIComponent(payload.codespaceName)}`, {
        method: "DELETE",
      });
      if (response.status === 202 || response.status === 204) {
        return { ok: true as const, deleted: true as const, codespaceName: payload.codespaceName };
      }
      if (response.status === 404) return upstream("Codespace not found.");
      return mapRateOrUpstream(response, "GitHub rejected the delete codespace request.");
    },

    async listMachines(input: unknown) {
      const payload = validateListCodespaceMachinesInput(input);
      const response = await client.fetchJSON(`/user/codespaces/${encodeURIComponent(payload.codespaceName)}/machines`);
      if (response.status === 200) {
        const items = listBody(response.body, "machines");
        if (items) return { ok: true as const, machines: items.map(normalizeMachine) };
        return upstream("GitHub rejected the list codespace machines request.");
      }
      if (response.status === 404) return upstream("Codespace machines not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list codespace machines request.");
    },

    async listSecretsForUser(input: unknown) {
      const payload = validateListCodespacesSecretsInput(input);
      const response = await client.fetchJSON(`/user/codespaces/secrets${query(pageQuery(payload))}`);
      return secretList(response, "Codespaces secrets not found.", "GitHub rejected the list codespaces secrets request.");
    },
  };
}

function secretList(
  response: { status: number; headers: Record<string, string>; body: unknown },
  missing: string,
  rejected: string,
) {
  if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.secrets)) {
    const secrets = response.body.secrets.filter(isRecord).map(normalizeNamedSecret);
    return {
      ok: true as const,
      total_count: typeof response.body.total_count === "number" ? response.body.total_count : secrets.length,
      secrets,
    };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function codespaceList(
  response: { status: number; headers: Record<string, string>; body: unknown },
  missing: string,
  rejected: string,
) {
  if (response.status === 200) {
    const items = listBody(response.body, "codespaces");
    if (items) return { ok: true as const, codespaces: items.map(normalizeCodespace) };
    return upstream(rejected);
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function listBody(body: unknown, wrapped: string): Record<string, unknown>[] | null {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (isRecord(body) && Array.isArray(body[wrapped])) return body[wrapped].filter(isRecord);
  return null;
}

function pageQuery(payload: Page): Record<string, number | undefined> {
  return { per_page: payload.perPage, page: payload.page };
}

function query(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function repoScope(input: Record<string, unknown>): Repo {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function pageInput(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function mapRateOrUpstream(response: { status: number; headers: Record<string, string> }, message: string) {
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED" as const,
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      },
    };
  }
  return upstream(message);
}

function requireSingleSegment(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.includes("/") || text.includes("?") || text.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
