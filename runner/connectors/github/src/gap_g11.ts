import { createGitHubClient, type GitHubClient } from "./http";
import {
  connection,
  gqlRequest,
  isRecord,
  recordAt,
  type GraphqlError,
} from "./graphql";

// G11: GraphQL transport + 15 read lookups. All omit. Enrichment for G12/G13 exact observes.
// No graphql.mutate. No G12+.

const NODE_FIELDS = `
  __typename
  id
  ... on Repository {
    name
    nameWithOwner
    url
    description
    isPrivate
    databaseId
  }
  ... on Issue {
    number
    title
    url
    state
    databaseId
  }
  ... on PullRequest {
    number
    title
    url
    state
    databaseId
  }
  ... on User {
    login
    name
    url
    databaseId
    viewerIsFollowing
  }
  ... on Organization {
    login
    name
    url
    databaseId
    viewerIsFollowing
  }
  ... on Discussion {
    number
    title
    url
  }
  ... on Subscribable {
    viewerSubscription
  }
`;

const VIEWER_FIELDS = `
  id
  login
  name
  url
  databaseId
  status {
    emoji
    message
    expiresAt
    indicatesLimitedAvailability
    organization { id }
  }
`;

const REPO_FIELDS = `
  id
  databaseId
  name
  nameWithOwner
  url
  description
  isPrivate
  isFork
  createdAt
  updatedAt
  primaryLanguage { name }
  viewerSubscription
`;

const ORG_FIELDS = `
  id
  databaseId
  login
  name
  url
  description
  viewerIsFollowing
`;

const OWNER_FIELDS = `
  __typename
  id
  login
  ... on User { name url databaseId viewerIsFollowing }
  ... on Organization { name url databaseId viewerIsFollowing }
`;

const TOPIC_FIELDS = `
  id
  name
`;

const RESOURCE_FIELDS = `
  __typename
  ... on Repository { id name nameWithOwner url }
  ... on Issue { id number title url }
  ... on PullRequest { id number title url }
  ... on User { id login name url }
  ... on Organization { id login name url }
  ... on Discussion { id number title url }
`;

const CODE_OF_CONDUCT_FIELDS = `
  key
  name
  url
  body
`;

const LICENSE_FIELDS = `
  key
  spdxId
  name
  nickname
  url
  body
`;

const ADVISORY_FIELDS = `
  id
  ghsaId
  summary
  description
  severity
  publishedAt
  updatedAt
  permalink
  identifiers { type value }
`;

const VULN_FIELDS = `
  severity
  updatedAt
  vulnerableVersionRange
  firstPatchedVersion { identifier }
  package { name ecosystem }
  advisory { ghsaId summary severity permalink }
`;

type Ok<T> = { ok: true } & T;
type Result<T> = Ok<T> | GraphqlError;

export function validateGetGraphqlNodeInput(input: unknown): { id: string } {
  if (!isRecord(input)) throw new Error("graphql.node.get input must be an object");
  return { id: requireString(input.id, "id") };
}

export function validateGetGraphqlNodesInput(input: unknown): { ids: string[] } {
  if (!isRecord(input)) throw new Error("graphql.nodes.get input must be an object");
  const raw = input.ids;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) {
    throw new Error("ids must be an array of 1–100 node ids");
  }
  const ids = raw.map((value, index) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`ids[${index}] must be a non-empty string`);
    }
    return value.trim();
  });
  return { ids };
}

export function validateGetGraphqlRateLimitInput(input: unknown): { dryRun?: boolean } {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("graphql.rate_limit.get input must be an object");
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    throw new Error("dryRun must be a boolean");
  }
  return input.dryRun === undefined ? {} : { dryRun: input.dryRun };
}

export function validateGetGraphqlViewerInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("graphql.viewer.get input must be an object");
  return {};
}

export function validateGetGraphqlRepositoryInput(input: unknown): {
  owner: string;
  repo: string;
  followRenames?: boolean;
} {
  if (!isRecord(input)) throw new Error("graphql.repository.get input must be an object");
  const out: { owner: string; repo: string; followRenames?: boolean } = {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo ?? input.name, "repo"),
  };
  if (input.followRenames !== undefined) {
    if (typeof input.followRenames !== "boolean") throw new Error("followRenames must be a boolean");
    out.followRenames = input.followRenames;
  }
  return out;
}

export function validateGetGraphqlOrganizationInput(input: unknown): { login: string } {
  if (!isRecord(input)) throw new Error("graphql.organization.get input must be an object");
  return { login: requireString(input.login ?? input.org, "login") };
}

export function validateGetGraphqlRepositoryOwnerInput(input: unknown): { login: string } {
  if (!isRecord(input)) throw new Error("graphql.repository_owner.get input must be an object");
  return { login: requireString(input.login, "login") };
}

export function validateGetGraphqlTopicInput(input: unknown): {
  name: string;
  includeRelatedTopics?: boolean;
  relatedTopicsCount?: number;
} {
  if (!isRecord(input)) throw new Error("graphql.topic.get input must be an object");
  const out: { name: string; includeRelatedTopics?: boolean; relatedTopicsCount?: number } = {
    name: requireString(input.name, "name"),
  };
  if (input.includeRelatedTopics !== undefined) {
    if (typeof input.includeRelatedTopics !== "boolean") {
      throw new Error("includeRelatedTopics must be a boolean");
    }
    out.includeRelatedTopics = input.includeRelatedTopics;
  }
  if (input.relatedTopicsCount !== undefined) {
    out.relatedTopicsCount = requireInt(input.relatedTopicsCount, "relatedTopicsCount", 1, 10);
  }
  return out;
}

export function validateGetGraphqlResourceInput(input: unknown): { url: string } {
  if (!isRecord(input)) throw new Error("graphql.resource.get input must be an object");
  return { url: requireString(input.url, "url") };
}

export function validateGetGraphqlCodeOfConductInput(input: unknown): { key: string } {
  if (!isRecord(input)) throw new Error("graphql.codes_of_conduct.get input must be an object");
  return { key: requireString(input.key, "key") };
}

export function validateListGraphqlCodesOfConductInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("graphql.codes_of_conduct.list input must be an object");
  return {};
}

export function validateGetGraphqlLicenseInput(input: unknown): { key: string } {
  if (!isRecord(input)) throw new Error("graphql.licenses.get input must be an object");
  return { key: requireString(input.key, "key") };
}

export function validateListGraphqlLicensesInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("graphql.licenses.list input must be an object");
  return {};
}

export type SecurityAdvisoriesListInput = {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
  orderBy?: { field: string; direction: string };
  identifier?: { type: string; value: string };
  publishedSince?: string;
  updatedSince?: string;
  epssPercentage?: number;
  epssPercentile?: number;
  classifications?: string[];
};

export function validateListGraphqlSecurityAdvisoriesInput(input: unknown): SecurityAdvisoriesListInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("graphql.security_advisories.list input must be an object");
  return {
    ...pageArgs(input),
    ...(input.orderBy !== undefined ? { orderBy: requireOrderBy(input.orderBy, "orderBy") } : {}),
    ...(input.identifier !== undefined
      ? { identifier: requireIdentifier(input.identifier, "identifier") }
      : {}),
    ...(input.publishedSince !== undefined
      ? { publishedSince: requireString(input.publishedSince, "publishedSince") }
      : {}),
    ...(input.updatedSince !== undefined
      ? { updatedSince: requireString(input.updatedSince, "updatedSince") }
      : {}),
    ...(input.epssPercentage !== undefined
      ? { epssPercentage: requireNumber(input.epssPercentage, "epssPercentage") }
      : {}),
    ...(input.epssPercentile !== undefined
      ? { epssPercentile: requireNumber(input.epssPercentile, "epssPercentile") }
      : {}),
    ...(input.classifications !== undefined
      ? { classifications: requireStringList(input.classifications, "classifications") }
      : {}),
  };
}

export type SecurityVulnerabilitiesListInput = {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
  package?: string;
  ecosystem?: string;
  severities?: string[];
  classifications?: string[];
  orderBy?: { field: string; direction: string };
};

export function validateListGraphqlSecurityVulnerabilitiesInput(
  input: unknown,
): SecurityVulnerabilitiesListInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("graphql.security_vulnerabilities.list input must be an object");
  return {
    ...pageArgs(input),
    ...(input.package !== undefined ? { package: requireString(input.package, "package") } : {}),
    ...(input.ecosystem !== undefined ? { ecosystem: requireString(input.ecosystem, "ecosystem") } : {}),
    ...(input.severities !== undefined
      ? { severities: requireStringList(input.severities, "severities") }
      : {}),
    ...(input.classifications !== undefined
      ? { classifications: requireStringList(input.classifications, "classifications") }
      : {}),
    ...(input.orderBy !== undefined ? { orderBy: requireOrderBy(input.orderBy, "orderBy") } : {}),
  };
}

export function createGapG11Client(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async getNode(input: unknown): Promise<Result<{ found: boolean; node: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlNodeInput(input);
      const result = await gqlRequest(
        clientFor("graphql.node.get"),
        `query Node($id: ID!) { node(id: $id) { ${NODE_FIELDS} } }`,
        { id: payload.id },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) {
        return { ok: true, found: false, node: null };
      }
      const node = recordAt(result.data, "node");
      return { ok: true, found: node !== null, node };
    },

    async getNodes(input: unknown): Promise<Result<{ nodes: Array<Record<string, unknown> | null> }>> {
      const payload = validateGetGraphqlNodesInput(input);
      const result = await gqlRequest(
        clientFor("graphql.nodes.get"),
        `query Nodes($ids: [ID!]!) { nodes(ids: $ids) { ${NODE_FIELDS} } }`,
        { ids: payload.ids },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      const raw = Array.isArray(result.data.nodes) ? result.data.nodes : [];
      const nodes = raw.map((item) => (isRecord(item) ? item : null));
      return { ok: true, nodes };
    },

    async getRateLimit(input: unknown): Promise<Result<{ rateLimit: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlRateLimitInput(input);
      const result = await gqlRequest(
        clientFor("graphql.rate_limit.get"),
        `query RateLimit($dryRun: Boolean) {
          rateLimit(dryRun: $dryRun) { limit remaining used resetAt cost }
        }`,
        { dryRun: payload.dryRun ?? false },
      );
      if (!result.ok) return result;
      return { ok: true, rateLimit: recordAt(result.data, "rateLimit") };
    },

    async getViewer(input: unknown): Promise<Result<{ viewer: Record<string, unknown> }>> {
      validateGetGraphqlViewerInput(input);
      const result = await gqlRequest(
        clientFor("graphql.viewer.get"),
        `query Viewer { viewer { ${VIEWER_FIELDS} } }`,
      );
      if (!result.ok) return result;
      const viewer = recordAt(result.data, "viewer");
      if (!viewer) return upstream("GitHub did not return the viewer.");
      return { ok: true, viewer };
    },

    async getRepository(
      input: unknown,
    ): Promise<Result<{ found: boolean; repository: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlRepositoryInput(input);
      const result = await gqlRequest(
        clientFor("graphql.repository.get"),
        `query Repository($owner: String!, $name: String!, $followRenames: Boolean) {
          repository(owner: $owner, name: $name, followRenames: $followRenames) { ${REPO_FIELDS} }
        }`,
        {
          owner: payload.owner,
          name: payload.repo,
          followRenames: payload.followRenames ?? true,
        },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) {
        return { ok: true, found: false, repository: null };
      }
      const repository = recordAt(result.data, "repository");
      return { ok: true, found: repository !== null, repository };
    },

    async getOrganization(
      input: unknown,
    ): Promise<Result<{ found: boolean; organization: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlOrganizationInput(input);
      const result = await gqlRequest(
        clientFor("graphql.organization.get"),
        `query Organization($login: String!) {
          organization(login: $login) { ${ORG_FIELDS} }
        }`,
        { login: payload.login },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) {
        return { ok: true, found: false, organization: null };
      }
      const organization = recordAt(result.data, "organization");
      return { ok: true, found: organization !== null, organization };
    },

    async getRepositoryOwner(
      input: unknown,
    ): Promise<Result<{ found: boolean; repositoryOwner: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlRepositoryOwnerInput(input);
      const result = await gqlRequest(
        clientFor("graphql.repository_owner.get"),
        `query RepositoryOwner($login: String!) {
          repositoryOwner(login: $login) { ${OWNER_FIELDS} }
        }`,
        { login: payload.login },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) {
        return { ok: true, found: false, repositoryOwner: null };
      }
      const repositoryOwner = recordAt(result.data, "repositoryOwner");
      return { ok: true, found: repositoryOwner !== null, repositoryOwner };
    },

    async getTopic(
      input: unknown,
    ): Promise<Result<{ found: boolean; topic: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlTopicInput(input);
      const includeRelated = payload.includeRelatedTopics === true;
      const relatedCount = payload.relatedTopicsCount ?? 3;
      const relatedSelection = includeRelated
        ? `relatedTopics(first: ${relatedCount}) { ${TOPIC_FIELDS} }`
        : "";
      const result = await gqlRequest(
        clientFor("graphql.topic.get"),
        `query Topic($name: String!) {
          topic(name: $name) { ${TOPIC_FIELDS} ${relatedSelection} }
        }`,
        { name: payload.name },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) {
        return { ok: true, found: false, topic: null };
      }
      const topic = recordAt(result.data, "topic");
      return { ok: true, found: topic !== null, topic };
    },

    async getResource(
      input: unknown,
    ): Promise<Result<{ found: boolean; resource: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlResourceInput(input);
      const result = await gqlRequest(
        clientFor("graphql.resource.get"),
        `query Resource($url: URI!) {
          resource(url: $url) { ${RESOURCE_FIELDS} }
        }`,
        { url: payload.url },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) {
        return { ok: true, found: false, resource: null };
      }
      const resource = recordAt(result.data, "resource");
      return { ok: true, found: resource !== null, resource };
    },

    async getCodeOfConduct(
      input: unknown,
    ): Promise<Result<{ found: boolean; codeOfConduct: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlCodeOfConductInput(input);
      const result = await gqlRequest(
        clientFor("graphql.codes_of_conduct.get"),
        `query CodeOfConduct($key: String!) {
          codeOfConduct(key: $key) { ${CODE_OF_CONDUCT_FIELDS} }
        }`,
        { key: payload.key },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) {
        return { ok: true, found: false, codeOfConduct: null };
      }
      const codeOfConduct = recordAt(result.data, "codeOfConduct");
      return { ok: true, found: codeOfConduct !== null, codeOfConduct };
    },

    async listCodesOfConduct(
      input: unknown,
    ): Promise<Result<{ codesOfConduct: Record<string, unknown>[] }>> {
      validateListGraphqlCodesOfConductInput(input);
      const result = await gqlRequest(
        clientFor("graphql.codes_of_conduct.list"),
        `query CodesOfConduct { codesOfConduct { ${CODE_OF_CONDUCT_FIELDS} } }`,
      );
      if (!result.ok) return result;
      const list = Array.isArray(result.data.codesOfConduct)
        ? result.data.codesOfConduct.filter(isRecord)
        : [];
      return { ok: true, codesOfConduct: list };
    },

    async getLicense(
      input: unknown,
    ): Promise<Result<{ found: boolean; license: Record<string, unknown> | null }>> {
      const payload = validateGetGraphqlLicenseInput(input);
      const result = await gqlRequest(
        clientFor("graphql.licenses.get"),
        `query License($key: String!) {
          license(key: $key) { ${LICENSE_FIELDS} }
        }`,
        { key: payload.key },
        { allowNotFound: true },
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) {
        return { ok: true, found: false, license: null };
      }
      const license = recordAt(result.data, "license");
      return { ok: true, found: license !== null, license };
    },

    async listLicenses(input: unknown): Promise<Result<{ licenses: Record<string, unknown>[] }>> {
      validateListGraphqlLicensesInput(input);
      const result = await gqlRequest(
        clientFor("graphql.licenses.list"),
        `query Licenses { licenses { ${LICENSE_FIELDS} } }`,
      );
      if (!result.ok) return result;
      const list = Array.isArray(result.data.licenses) ? result.data.licenses.filter(isRecord) : [];
      return { ok: true, licenses: list };
    },

    async listSecurityAdvisories(
      input: unknown,
    ): Promise<Result<{ advisories: Record<string, unknown>[]; pageInfo: ReturnType<typeof connection>["pageInfo"]; totalCount?: number }>> {
      const payload = validateListGraphqlSecurityAdvisoriesInput(input);
      const first = payload.first ?? (payload.last === undefined ? 20 : undefined);
      const result = await gqlRequest(
        clientFor("graphql.security_advisories.list"),
        `query SecurityAdvisories(
          $first: Int, $after: String, $last: Int, $before: String,
          $orderBy: SecurityAdvisoryOrder, $identifier: SecurityAdvisoryIdentifierFilter,
          $publishedSince: DateTime, $updatedSince: DateTime,
          $epssPercentage: Float, $epssPercentile: Float,
          $classifications: [SecurityAdvisoryClassification!]
        ) {
          securityAdvisories(
            first: $first, after: $after, last: $last, before: $before,
            orderBy: $orderBy, identifier: $identifier,
            publishedSince: $publishedSince, updatedSince: $updatedSince,
            epssPercentage: $epssPercentage, epssPercentile: $epssPercentile,
            classifications: $classifications
          ) {
            totalCount
            nodes { ${ADVISORY_FIELDS} }
            pageInfo { hasNextPage endCursor hasPreviousPage startCursor }
          }
        }`,
        {
          first: first ?? null,
          after: payload.after ?? null,
          last: payload.last ?? null,
          before: payload.before ?? null,
          orderBy: payload.orderBy ?? null,
          identifier: payload.identifier ?? null,
          publishedSince: payload.publishedSince ?? null,
          updatedSince: payload.updatedSince ?? null,
          epssPercentage: payload.epssPercentage ?? null,
          epssPercentile: payload.epssPercentile ?? null,
          classifications: payload.classifications ?? null,
        },
      );
      if (!result.ok) return result;
      const conn = connection(recordAt(result.data, "securityAdvisories"), (node) => node);
      return {
        ok: true,
        advisories: conn.items,
        pageInfo: conn.pageInfo,
        ...(conn.totalCount !== undefined ? { totalCount: conn.totalCount } : {}),
      };
    },

    async listSecurityVulnerabilities(
      input: unknown,
    ): Promise<Result<{ vulnerabilities: Record<string, unknown>[]; pageInfo: ReturnType<typeof connection>["pageInfo"]; totalCount?: number }>> {
      const payload = validateListGraphqlSecurityVulnerabilitiesInput(input);
      const first = payload.first ?? (payload.last === undefined ? 20 : undefined);
      const result = await gqlRequest(
        clientFor("graphql.security_vulnerabilities.list"),
        `query SecurityVulnerabilities(
          $first: Int, $after: String, $last: Int, $before: String,
          $orderBy: SecurityVulnerabilityOrder, $package: String,
          $ecosystem: SecurityAdvisoryEcosystem,
          $severities: [SecurityAdvisorySeverity!],
          $classifications: [SecurityAdvisoryClassification!]
        ) {
          securityVulnerabilities(
            first: $first, after: $after, last: $last, before: $before,
            orderBy: $orderBy, package: $package, ecosystem: $ecosystem,
            severities: $severities, classifications: $classifications
          ) {
            totalCount
            nodes { ${VULN_FIELDS} }
            pageInfo { hasNextPage endCursor hasPreviousPage startCursor }
          }
        }`,
        {
          first: first ?? null,
          after: payload.after ?? null,
          last: payload.last ?? null,
          before: payload.before ?? null,
          orderBy: payload.orderBy ?? null,
          package: payload.package ?? null,
          ecosystem: payload.ecosystem ?? null,
          severities: payload.severities ?? null,
          classifications: payload.classifications ?? null,
        },
      );
      if (!result.ok) return result;
      const conn = connection(recordAt(result.data, "securityVulnerabilities"), (node) => node);
      return {
        ok: true,
        vulnerabilities: conn.items,
        pageInfo: conn.pageInfo,
        ...(conn.totalCount !== undefined ? { totalCount: conn.totalCount } : {}),
      };
    },
  };
}

function upstream(message: string): GraphqlError {
  return {
    ok: false,
    error: { code: "CONNECTOR_UPSTREAM_ERROR", message, retryAfterSeconds: undefined },
  };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function requireStringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty string array`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${name}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
}

function requireOrderBy(value: unknown, name: string): { field: string; direction: string } {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return {
    field: requireString(value.field, `${name}.field`),
    direction: requireString(value.direction, `${name}.direction`),
  };
}

function requireIdentifier(value: unknown, name: string): { type: string; value: string } {
  if (!isRecord(value)) throw new Error(`${name} must be an object`);
  return {
    type: requireString(value.type, `${name}.type`),
    value: requireString(value.value, `${name}.value`),
  };
}

function pageArgs(input: Record<string, unknown>): {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
} {
  const out: { first?: number; after?: string; last?: number; before?: string } = {};
  if (input.first !== undefined) out.first = requireInt(input.first, "first", 1, 100);
  if (input.last !== undefined) out.last = requireInt(input.last, "last", 1, 100);
  if (input.after !== undefined) out.after = requireString(input.after, "after");
  if (input.before !== undefined) out.before = requireString(input.before, "before");
  if (out.first !== undefined && out.last !== undefined) {
    throw new Error("first and last cannot both be set");
  }
  return out;
}
