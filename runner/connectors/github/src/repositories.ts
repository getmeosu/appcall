export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  html_url?: string;
  private?: boolean;
  fork?: boolean;
  language?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  default_branch?: string;
  owner?: { login?: string; id?: number };
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
  [key: string]: unknown;
};

export type NormalizedRepository = {
  id: string;
  provider: "github";
  providerRepoId: number;
  name: string;
  fullName: string;
  description: string;
  url: string;
  isPrivate: boolean;
  isFork: boolean;
  language: string;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubRepository;
};

export function normalizeGitHubRepository(repo: GitHubRepository): NormalizedRepository {
  return {
    id: `gh-repo:${repo.id}`,
    provider: "github",
    providerRepoId: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? "",
    url: repo.html_url ?? "",
    isPrivate: repo.private ?? false,
    isFork: repo.fork ?? false,
    language: repo.language ?? "",
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    defaultBranch: repo.default_branch ?? "",
    owner: repo.owner?.login ?? "",
    createdAt: repo.created_at ?? "",
    updatedAt: repo.updated_at ?? "",
    pushedAt: repo.pushed_at ?? "",
    modelVersion: "2026-05-16",
    raw: repo,
  };
}

export function parseRepositoriesResponse(response: unknown): { repositories: GitHubRepository[]; nextLink: string | null } {
  const nextLink = isRecord(response) ? parseNextLink(response) : null;
  const value = Array.isArray(response) ? response : (isRecord(response) ? (response.value ?? null) : null);
  if (!Array.isArray(value)) return { repositories: [], nextLink };
  return {
    repositories: value.filter(isRecord).map((r) => ({
      id: requireNumber(r.id, "id"),
      name: requireString(r.name, "name"),
      full_name: requireString(r.full_name, "full_name"),
      description: typeof r.description === "string" ? r.description : undefined,
      html_url: typeof r.html_url === "string" ? r.html_url : undefined,
      private: typeof r.private === "boolean" ? r.private : undefined,
      fork: typeof r.fork === "boolean" ? r.fork : undefined,
      language: typeof r.language === "string" ? r.language : undefined,
      stargazers_count: typeof r.stargazers_count === "number" ? r.stargazers_count : undefined,
      forks_count: typeof r.forks_count === "number" ? r.forks_count : undefined,
      open_issues_count: typeof r.open_issues_count === "number" ? r.open_issues_count : undefined,
      default_branch: typeof r.default_branch === "string" ? r.default_branch : undefined,
      owner: isRecord(r.owner) ? { login: typeof r.owner.login === "string" ? r.owner.login : undefined, id: typeof r.owner.id === "number" ? r.owner.id : undefined } : undefined,
      created_at: typeof r.created_at === "string" ? r.created_at : undefined,
      updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
      pushed_at: typeof r.pushed_at === "string" ? r.pushed_at : undefined,
    })),
    nextLink,
  };
}

function parseNextLink(response: Record<string, unknown>): string | null {
  const link = response.nextLink;
  return typeof link === "string" && link.length > 0 ? link : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`${field} must be a number`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
