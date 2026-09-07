/**
 * Ashby object normalization.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  employmentType: string | null;
  createdAt: string | null;
}

interface AshbyJob {
  id: string;
  title?: string | null;
  locationName?: string | null;
  departmentName?: string | null;
  employmentType?: string | null;
  descriptionHtml?: string | null;
  url?: string | null;
  publishedAt?: string | null;
}

export function normalizeJob(job: AshbyJob): NormalizedJob {
  return {
    id: `ash-job:${job.id}`,
    provider: "ashby",
    title: job.title ?? "",
    location: job.locationName ?? null,
    department: job.departmentName ?? null,
    employmentType: job.employmentType ?? null,
    createdAt: job.publishedAt ?? null,
  };
}

interface AshbyJobsResponse {
  jobs?: AshbyJob[];
}

export function parseJobsResponse(raw: unknown): NormalizedJob[] {
  const data = raw as AshbyJobsResponse;
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.map(normalizeJob);
}
