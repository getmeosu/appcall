/**
 * Workable object normalization.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  state: string | null;
  url: string | null;
  location: string | null;
  department: string | null;
  type: string | null;
}

interface WorkableLocation {
  city?: string;
  region?: string;
  country?: string;
}

interface WorkableJob {
  id: string;
  title?: string | null;
  state?: string | null;
  url?: string | null;
  location?: WorkableLocation | null;
  department?: { name?: string } | null;
  type?: string | null;
  employmentType?: string | null;
}

function formatLocation(location: WorkableLocation | null | undefined): string | null {
  if (!location) return null;
  const parts = [location.city, location.region, location.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function normalizeJob(job: WorkableJob): NormalizedJob {
  return {
    id: `wk-job:${job.id}`,
    provider: "workable",
    title: job.title ?? "",
    state: job.state ?? null,
    url: job.url ?? null,
    location: formatLocation(job.location),
    department: job.department?.name ?? null,
    type: job.type ?? job.employmentType ?? null,
  };
}

interface WorkableJobsResponse {
  jobs?: WorkableJob[];
}

export function parseJobsResponse(raw: unknown): NormalizedJob[] {
  const data = raw as WorkableJobsResponse;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.map(normalizeJob);
}
