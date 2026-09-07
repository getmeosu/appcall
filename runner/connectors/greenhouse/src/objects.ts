/**
 * Greenhouse object normalization.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  jobType: string | null;
  updatedAt: string | null;
  url: string | null;
}

interface GreenhouseLocation {
  name?: string;
}

interface GreenhouseJob {
  id: number;
  title?: string;
  location?: GreenhouseLocation | null;
  departments?: Array<{ name?: string }> | null;
  updated_at?: string | null;
  absolute_url?: string | null;
  metadata?: Array<{
    name?: string;
    value?: string | null;
  }> | null;
}

export function normalizeJob(job: GreenhouseJob): NormalizedJob {
  const location = job.location?.name ?? null;
  const department = job.departments?.[0]?.name ?? null;

  let jobType: string | null = null;
  if (job.metadata) {
    const typeMeta = job.metadata.find((m) => m.name === "Employment Type");
    if (typeMeta?.value) jobType = typeMeta.value;
  }

  return {
    id: `gh-job:${job.id}`,
    provider: "greenhouse",
    title: job.title ?? "",
    location,
    department,
    jobType,
    updatedAt: job.updated_at ?? null,
    url: job.absolute_url ?? null,
  };
}

interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta?: { total?: number };
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
} {
  const data = raw as GreenhouseJobsResponse;
  const jobs = (data.jobs ?? []).map(normalizeJob);
  const total = data.meta?.total ?? null;
  return { jobs, total };
}
