export type GitHubCommit = {
  sha: string;
  commit?: {
    author?: { name?: string; email?: string; date?: string };
    committer?: { name?: string; email?: string; date?: string };
    message?: string;
  };
  html_url?: string;
  author?: { login?: string };
  [key: string]: unknown;
};

export type NormalizedCommit = {
  id: string;
  provider: "github";
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  committer: string;
  committerEmail: string;
  url: string;
  authoredAt: string;
  committedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubCommit;
};

export function normalizeGitHubCommit(commit: GitHubCommit): NormalizedCommit {
  return {
    id: `gh-commit:${commit.sha}`,
    provider: "github",
    sha: commit.sha,
    message: commit.commit?.message ?? "",
    author: commit.commit?.author?.name ?? commit.author?.login ?? "",
    authorEmail: commit.commit?.author?.email ?? "",
    committer: commit.commit?.committer?.name ?? "",
    committerEmail: commit.commit?.committer?.email ?? "",
    url: commit.html_url ?? "",
    authoredAt: commit.commit?.author?.date ?? "",
    committedAt: commit.commit?.committer?.date ?? "",
    modelVersion: "2026-05-16",
    raw: commit,
  };
}

export function parseCommitsResponse(response: unknown): { commits: GitHubCommit[]; nextLink: string | null } {
  const nextLink = isRecord(response) ? parseNextLink(response) : null;
  const value = Array.isArray(response) ? response : (isRecord(response) ? (response.value ?? null) : null);
  if (!Array.isArray(value)) return { commits: [], nextLink };
  return {
    commits: value.filter(isRecord).map((c) => ({
      sha: requireString(c.sha, "sha"),
      commit: isRecord(c.commit) ? {
        author: isRecord(c.commit.author) ? { name: typeof c.commit.author.name === "string" ? c.commit.author.name : undefined, email: typeof c.commit.author.email === "string" ? c.commit.author.email : undefined, date: typeof c.commit.author.date === "string" ? c.commit.author.date : undefined } : undefined,
        committer: isRecord(c.commit.committer) ? { name: typeof c.commit.committer.name === "string" ? c.commit.committer.name : undefined, email: typeof c.commit.committer.email === "string" ? c.commit.committer.email : undefined, date: typeof c.commit.committer.date === "string" ? c.commit.committer.date : undefined } : undefined,
        message: typeof c.commit.message === "string" ? c.commit.message : undefined,
      } : undefined,
      html_url: typeof c.html_url === "string" ? c.html_url : undefined,
      author: isRecord(c.author) ? { login: typeof c.author.login === "string" ? c.author.login : undefined } : undefined,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
