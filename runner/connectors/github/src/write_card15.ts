import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type RepoScope = { owner: string; repo: string };
type GhsaScope = RepoScope & { ghsaId: string };
type KeyScope = RepoScope & { keyId: number };
type RulesetScope = RepoScope & { rulesetId: number };

type Vulnerability = {
  package: { ecosystem: string; name?: string | null };
  vulnerableVersionRange?: string | null;
  patchedVersions?: string | null;
  vulnerableFunctions?: string[] | null;
};

type SecurityReport = RepoScope & {
  summary: string;
  description: string;
  vulnerabilities?: Vulnerability[] | null;
  cweIds?: string[] | null;
  severity?: "critical" | "high" | "medium" | "low" | null;
  cvssVectorString?: string | null;
  startPrivateFork?: boolean;
};

type DeployKeyCreate = RepoScope & {
  key: string;
  title?: string;
  readOnly?: boolean;
};

type BypassActor = {
  actorId?: number | null;
  actorType: "Integration" | "OrganizationAdmin" | "RepositoryRole" | "Team" | "DeployKey" | "User";
  bypassMode?: "always" | "pull_request" | "exempt";
};

type RulesetConditions = {
  refName?: { include?: string[]; exclude?: string[] };
};

type RulesetRule = { type: string; parameters?: Record<string, unknown> };

type RulesetCreate = RepoScope & {
  name: string;
  enforcement: "disabled" | "active" | "evaluate";
  target?: "branch" | "tag" | "push";
  bypassActors?: BypassActor[];
  conditions?: RulesetConditions;
  rules?: RulesetRule[];
};

type RulesetUpdate = RulesetScope & {
  name?: string;
  enforcement?: "disabled" | "active" | "evaluate";
  target?: "branch" | "tag" | "push";
  bypassActors?: BypassActor[];
  conditions?: RulesetConditions;
  rules?: RulesetRule[];
};

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const ECOSYSTEMS = [
  "rubygems", "npm", "pip", "maven", "nuget", "composer", "go", "rust", "erlang", "actions", "pub", "other", "swift",
] as const;
const ENFORCEMENTS = ["disabled", "active", "evaluate"] as const;
const TARGETS = ["branch", "tag", "push"] as const;
const ACTOR_TYPES = ["Integration", "OrganizationAdmin", "RepositoryRole", "Team", "DeployKey", "User"] as const;
const BYPASS_MODES = ["always", "pull_request", "exempt"] as const;

export function validateCreateSecurityAdvisoryReportInput(input: unknown): SecurityReport {
  if (!isRecord(input)) throw new Error("repos.security_advisories.reports.create input must be an object");
  const out: SecurityReport = {
    ...repoScope(input),
    summary: requireNonEmptyString(input.summary, "summary"),
    description: requireNonEmptyString(input.description, "description"),
  };
  if (input.vulnerabilities !== undefined) {
    out.vulnerabilities = input.vulnerabilities === null ? null : parseVulnerabilities(input.vulnerabilities);
  }
  if (input.cweIds !== undefined || input.cwe_ids !== undefined) {
    const value = input.cweIds ?? input.cwe_ids;
    out.cweIds = value === null ? null : requireStringArray(value, "cweIds");
  }
  if (input.severity !== undefined) {
    if (input.severity === null) out.severity = null;
    else if (typeof input.severity === "string" && SEVERITIES.includes(input.severity as (typeof SEVERITIES)[number])) {
      out.severity = input.severity as (typeof SEVERITIES)[number];
    } else {
      throw new Error("severity must be critical, high, medium, low, or null");
    }
  }
  if (input.cvssVectorString !== undefined || input.cvss_vector_string !== undefined) {
    const value = input.cvssVectorString ?? input.cvss_vector_string;
    out.cvssVectorString = value === null ? null : requireNonEmptyString(value, "cvssVectorString");
  }
  if (input.startPrivateFork !== undefined || input.start_private_fork !== undefined) {
    const value = input.startPrivateFork ?? input.start_private_fork;
    if (typeof value !== "boolean") throw new Error("startPrivateFork must be a boolean");
    out.startPrivateFork = value;
  }
  return out;
}

export function validateCreateSecurityAdvisoryForkInput(input: unknown): GhsaScope {
  if (!isRecord(input)) throw new Error("repos.security_advisories.forks.create input must be an object");
  return {
    ...repoScope(input),
    ghsaId: requireGhsaId(input.ghsa_id ?? input.ghsaId, "ghsa_id"),
  };
}

export function validateCreateRepoKeyInput(input: unknown): DeployKeyCreate {
  if (!isRecord(input)) throw new Error("repos.keys.create input must be an object");
  const out: DeployKeyCreate = {
    ...repoScope(input),
    key: requireNonEmptyString(input.key, "key"),
  };
  if (input.title !== undefined) out.title = requireNonEmptyString(input.title, "title");
  if (input.readOnly !== undefined || input.read_only !== undefined) {
    const value = input.readOnly ?? input.read_only;
    if (typeof value !== "boolean") throw new Error("readOnly must be a boolean");
    out.readOnly = value;
  }
  return out;
}

export function validateDeleteRepoKeyInput(input: unknown): KeyScope {
  if (!isRecord(input)) throw new Error("repos.keys.delete input must be an object");
  return {
    ...repoScope(input),
    keyId: requireId(input.keyId ?? input.key_id, "keyId"),
  };
}

export function validateCreateRepoRulesetInput(input: unknown): RulesetCreate {
  if (!isRecord(input)) throw new Error("repos.rulesets.create input must be an object");
  const enforcement = input.enforcement;
  if (typeof enforcement !== "string" || !ENFORCEMENTS.includes(enforcement as (typeof ENFORCEMENTS)[number])) {
    throw new Error("enforcement must be disabled, active, or evaluate");
  }
  const out: RulesetCreate = {
    ...repoScope(input),
    name: requireNonEmptyString(input.name, "name"),
    enforcement: enforcement as (typeof ENFORCEMENTS)[number],
  };
  applyOptionalRulesetBody(input, out);
  return out;
}

export function validateDeleteRepoRulesetInput(input: unknown): RulesetScope {
  if (!isRecord(input)) throw new Error("repos.rulesets.delete input must be an object");
  return {
    ...repoScope(input),
    rulesetId: requireId(input.rulesetId ?? input.ruleset_id, "rulesetId"),
  };
}

export function validateUpdateRepoRulesetInput(input: unknown): RulesetUpdate {
  if (!isRecord(input)) throw new Error("repos.rulesets.update input must be an object");
  const out: RulesetUpdate = {
    ...repoScope(input),
    rulesetId: requireId(input.rulesetId ?? input.ruleset_id, "rulesetId"),
  };
  if (input.name !== undefined) out.name = requireNonEmptyString(input.name, "name");
  if (input.enforcement !== undefined) {
    if (typeof input.enforcement !== "string" || !ENFORCEMENTS.includes(input.enforcement as (typeof ENFORCEMENTS)[number])) {
      throw new Error("enforcement must be disabled, active, or evaluate");
    }
    out.enforcement = input.enforcement as (typeof ENFORCEMENTS)[number];
  }
  applyOptionalRulesetBody(input, out);
  return out;
}

export function createWriteCard15Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async createSecurityAdvisoryReport(input: unknown) {
      const payload = validateCreateSecurityAdvisoryReportInput(input);
      const response = await clientFor("repos.security_advisories.reports.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/security-advisories/reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(securityReportBody(payload)),
        },
      );
      return jsonBody(response, [201], "advisory", "Repository was not found.", "GitHub rejected the privately report security vulnerability request.");
    },
    async createSecurityAdvisoryFork(input: unknown) {
      const payload = validateCreateSecurityAdvisoryForkInput(input);
      const response = await clientFor("repos.security_advisories.forks.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/security-advisories/${seg(payload.ghsaId)}/forks`,
        { method: "POST" },
      );
      return jsonBody(response, [202], "fork", "Security advisory was not found.", "GitHub rejected the create temporary private fork request.");
    },
    async createRepoKey(input: unknown) {
      const payload = validateCreateRepoKeyInput(input);
      const body: Record<string, unknown> = { key: payload.key };
      if (payload.title !== undefined) body.title = payload.title;
      if (payload.readOnly !== undefined) body.read_only = payload.readOnly;
      const response = await clientFor("repos.keys.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/keys`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return jsonBody(response, [201], "key", "Repository was not found.", "GitHub rejected the create deploy key request.");
    },
    async deleteRepoKey(input: unknown) {
      const payload = validateDeleteRepoKeyInput(input);
      const response = await clientFor("repos.keys.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/keys/${payload.keyId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, keyId: payload.keyId },
        "Deploy key was not found.",
        "GitHub rejected the delete deploy key request.",
      );
    },
    async createRepoRuleset(input: unknown) {
      const payload = validateCreateRepoRulesetInput(input);
      const response = await clientFor("repos.rulesets.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/rulesets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rulesetBody(payload)),
        },
      );
      return jsonBody(response, [201], "ruleset", "Repository was not found.", "GitHub rejected the create repository ruleset request.");
    },
    async deleteRepoRuleset(input: unknown) {
      const payload = validateDeleteRepoRulesetInput(input);
      const response = await clientFor("repos.rulesets.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/rulesets/${payload.rulesetId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, rulesetId: payload.rulesetId },
        "Repository ruleset was not found.",
        "GitHub rejected the delete repository ruleset request.",
      );
    },
    async updateRepoRuleset(input: unknown) {
      const payload = validateUpdateRepoRulesetInput(input);
      const response = await clientFor("repos.rulesets.update").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/rulesets/${payload.rulesetId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rulesetBody(payload)),
        },
      );
      return jsonBody(response, [200], "ruleset", "Repository ruleset was not found.", "GitHub rejected the update repository ruleset request.");
    },
  };
}

function securityReportBody(payload: SecurityReport): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: payload.summary,
    description: payload.description,
  };
  if (payload.vulnerabilities !== undefined) {
    body.vulnerabilities = payload.vulnerabilities === null
      ? null
      : payload.vulnerabilities.map((item) => {
          const row: Record<string, unknown> = {
            package: {
              ecosystem: item.package.ecosystem,
              name: item.package.name === undefined ? undefined : item.package.name,
            },
          };
          if (item.vulnerableVersionRange !== undefined) bodyHas(row, "vulnerable_version_range", item.vulnerableVersionRange);
          if (item.patchedVersions !== undefined) bodyHas(row, "patched_versions", item.patchedVersions);
          if (item.vulnerableFunctions !== undefined) bodyHas(row, "vulnerable_functions", item.vulnerableFunctions);
          return row;
        });
  }
  if (payload.cweIds !== undefined) body.cwe_ids = payload.cweIds;
  if (payload.severity !== undefined) body.severity = payload.severity;
  if (payload.cvssVectorString !== undefined) body.cvss_vector_string = payload.cvssVectorString;
  if (payload.startPrivateFork !== undefined) body.start_private_fork = payload.startPrivateFork;
  return body;
}

function bodyHas(target: Record<string, unknown>, key: string, value: unknown) {
  target[key] = value;
}

function rulesetBody(payload: RulesetCreate | RulesetUpdate): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if ("name" in payload && payload.name !== undefined) body.name = payload.name;
  if (payload.enforcement !== undefined) body.enforcement = payload.enforcement;
  if (payload.target !== undefined) body.target = payload.target;
  if (payload.bypassActors !== undefined) {
    body.bypass_actors = payload.bypassActors.map((actor) => {
      const row: Record<string, unknown> = { actor_type: actor.actorType };
      if (actor.actorId !== undefined) row.actor_id = actor.actorId;
      if (actor.bypassMode !== undefined) row.bypass_mode = actor.bypassMode;
      return row;
    });
  }
  if (payload.conditions !== undefined) {
    const conditions: Record<string, unknown> = {};
    if (payload.conditions.refName !== undefined) {
      const refName: Record<string, unknown> = {};
      if (payload.conditions.refName.include !== undefined) refName.include = payload.conditions.refName.include;
      if (payload.conditions.refName.exclude !== undefined) refName.exclude = payload.conditions.refName.exclude;
      conditions.ref_name = refName;
    }
    body.conditions = conditions;
  }
  if (payload.rules !== undefined) {
    body.rules = payload.rules.map((rule) => {
      const row: Record<string, unknown> = { type: rule.type };
      if (rule.parameters !== undefined) row.parameters = rule.parameters;
      return row;
    });
  }
  return body;
}

function applyOptionalRulesetBody(input: Record<string, unknown>, out: { target?: RulesetCreate["target"]; bypassActors?: BypassActor[]; conditions?: RulesetConditions; rules?: RulesetRule[] }) {
  if (input.target !== undefined) {
    if (typeof input.target !== "string" || !TARGETS.includes(input.target as (typeof TARGETS)[number])) {
      throw new Error("target must be branch, tag, or push");
    }
    out.target = input.target as (typeof TARGETS)[number];
  }
  if (input.bypassActors !== undefined || input.bypass_actors !== undefined) {
    out.bypassActors = parseBypassActors(input.bypassActors ?? input.bypass_actors);
  }
  if (input.conditions !== undefined) out.conditions = parseConditions(input.conditions);
  if (input.rules !== undefined) out.rules = parseRules(input.rules);
}

function parseVulnerabilities(value: unknown): Vulnerability[] {
  if (!Array.isArray(value)) throw new Error("vulnerabilities must be an array");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`vulnerabilities[${index}] must be an object`);
    if (!isRecord(item.package)) throw new Error(`vulnerabilities[${index}].package must be an object`);
    const ecosystem = item.package.ecosystem;
    if (typeof ecosystem !== "string" || !ECOSYSTEMS.includes(ecosystem as (typeof ECOSYSTEMS)[number])) {
      throw new Error(`vulnerabilities[${index}].package.ecosystem is invalid`);
    }
    const row: Vulnerability = {
      package: { ecosystem },
    };
    if (item.package.name !== undefined) {
      if (item.package.name !== null && typeof item.package.name !== "string") {
        throw new Error(`vulnerabilities[${index}].package.name must be a string or null`);
      }
      row.package.name = item.package.name;
    }
    if (item.vulnerableVersionRange !== undefined || item.vulnerable_version_range !== undefined) {
      const range = item.vulnerableVersionRange ?? item.vulnerable_version_range;
      if (range !== null && typeof range !== "string") {
        throw new Error(`vulnerabilities[${index}].vulnerableVersionRange must be a string or null`);
      }
      row.vulnerableVersionRange = range as string | null;
    }
    if (item.patchedVersions !== undefined || item.patched_versions !== undefined) {
      const patched = item.patchedVersions ?? item.patched_versions;
      if (patched !== null && typeof patched !== "string") {
        throw new Error(`vulnerabilities[${index}].patchedVersions must be a string or null`);
      }
      row.patchedVersions = patched as string | null;
    }
    if (item.vulnerableFunctions !== undefined || item.vulnerable_functions !== undefined) {
      const functions = item.vulnerableFunctions ?? item.vulnerable_functions;
      row.vulnerableFunctions = functions === null ? null : requireStringArray(functions, `vulnerabilities[${index}].vulnerableFunctions`);
    }
    return row;
  });
}

function parseBypassActors(value: unknown): BypassActor[] {
  if (!Array.isArray(value)) throw new Error("bypassActors must be an array");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`bypassActors[${index}] must be an object`);
    const actorType = item.actorType ?? item.actor_type;
    if (typeof actorType !== "string" || !ACTOR_TYPES.includes(actorType as (typeof ACTOR_TYPES)[number])) {
      throw new Error(`bypassActors[${index}].actorType is invalid`);
    }
    const out: BypassActor = { actorType: actorType as BypassActor["actorType"] };
    if (item.actorId !== undefined || item.actor_id !== undefined) {
      const actorId = item.actorId ?? item.actor_id;
      if (actorId !== null && (typeof actorId !== "number" || !Number.isSafeInteger(actorId))) {
        throw new Error(`bypassActors[${index}].actorId must be an integer or null`);
      }
      out.actorId = actorId as number | null;
    }
    if (item.bypassMode !== undefined || item.bypass_mode !== undefined) {
      const mode = item.bypassMode ?? item.bypass_mode;
      if (typeof mode !== "string" || !BYPASS_MODES.includes(mode as (typeof BYPASS_MODES)[number])) {
        throw new Error(`bypassActors[${index}].bypassMode is invalid`);
      }
      out.bypassMode = mode as BypassActor["bypassMode"];
    }
    return out;
  });
}

function parseConditions(value: unknown): RulesetConditions {
  if (!isRecord(value)) throw new Error("conditions must be an object");
  const out: RulesetConditions = {};
  if (value.refName !== undefined || value.ref_name !== undefined) {
    const ref = value.refName ?? value.ref_name;
    if (!isRecord(ref)) throw new Error("conditions.refName must be an object");
    const refName: { include?: string[]; exclude?: string[] } = {};
    if (ref.include !== undefined) refName.include = requireStringArray(ref.include, "conditions.refName.include");
    if (ref.exclude !== undefined) refName.exclude = requireStringArray(ref.exclude, "conditions.refName.exclude");
    out.refName = refName;
  }
  return out;
}

function parseRules(value: unknown): RulesetRule[] {
  if (!Array.isArray(value)) throw new Error("rules must be an array");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`rules[${index}] must be an object`);
    if (typeof item.type !== "string" || item.type.length === 0) {
      throw new Error(`rules[${index}].type is required`);
    }
    const out: RulesetRule = { type: item.type };
    if (item.parameters !== undefined) {
      if (!isRecord(item.parameters)) throw new Error(`rules[${index}].parameters must be an object`);
      out.parameters = item.parameters;
    }
    return out;
  });
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number[],
  key: string,
  missing: string,
  rejected: string,
) {
  if (success.includes(response.status) && isRecord(response.body)) {
    return { ok: true as const, [key]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
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

function repoScope(input: Record<string, unknown>): RepoScope {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value as string[];
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireGhsaId(value: unknown, field: string): string {
  const text = requireNonEmptyString(value, field);
  if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(text)) {
    throw new Error(`${field} must be a GHSA id`);
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
