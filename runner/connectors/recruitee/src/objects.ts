/**
 * Recruitee object normalization.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  employmentType: string | null;
  url: string | null;
  createdAt: string | null;
}

interface RecruiteeLocation {
  city?: string;
  country?: string;
}

interface RecruiteeJob {
  id: number;
  title?: string | null;
  location?: RecruiteeLocation | null;
  department?: { name?: string } | null;
  employment_type?: string | null;
  url?: string | null;
  created_at?: string | null;
}

function formatLocation(location: RecruiteeLocation | null | undefined): string | null {
  if (!location) return null;
  const parts = [location.city, location.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function normalizeJob(job: RecruiteeJob): NormalizedJob {
  return {
    id: `rc-job:${job.id}`,
    provider: "recruitee",
    title: job.title ?? "",
    location: formatLocation(job.location),
    department: job.department?.name ?? null,
    employmentType: job.employment_type ?? null,
    url: job.url ?? null,
    createdAt: job.created_at ?? null,
  };
}

interface RecruiteeOffersResponse {
  offers?: RecruiteeJob[];
  total?: number;
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
} {
  const data = raw as RecruiteeOffersResponse;
  const offers = Array.isArray(data.offers) ? data.offers : [];
  const total = data.total ?? null;
  return { jobs: offers.map(normalizeJob), total };
}
