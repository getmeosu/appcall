/**
 * Lever object normalization.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  team: string | null;
  commitment: string | null;
  description: string | null;
  url: string | null;
}

interface LeverCategories {
  location?: string | null;
  team?: string | null;
  commitment?: string | null;
}

interface LeverContent {
  description?: string | null;
}

interface LeverPosting {
  id: string;
  text?: string | null;
  categories?: LeverCategories | null;
  content?: LeverContent | null;
  hostedUrl?: string | null;
}

export function normalizeJob(posting: LeverPosting): NormalizedJob {
  const categories = posting.categories ?? {};
  const content = posting.content ?? {};

  return {
    id: `lev-job:${posting.id}`,
    provider: "lever",
    title: posting.text ?? "",
    location: categories.location ?? null,
    team: categories.team ?? null,
    commitment: categories.commitment ?? null,
    description: content.description ?? null,
    url: posting.hostedUrl ?? null,
  };
}

export function parseJobsResponse(raw: unknown): NormalizedJob[] {
  const data = raw as LeverPosting[];
  const postings = Array.isArray(data) ? data : [];
  return postings.map(normalizeJob);
}
