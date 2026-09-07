/**
 * SmartRecruiters object normalization.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  type: string | null;
  createdAt: string | null;
}

interface SRLocation {
  id?: string;
}

interface SRDepartment {
  id?: string;
  label?: string;
}

interface SRJob {
  id: string;
  title?: string | null;
  location?: SRLocation | null;
  department?: SRDepartment | null;
  type?: { id?: string; label?: string } | null;
  createdOn?: string | null;
}

export function normalizeJob(job: SRJob): NormalizedJob {
  return {
    id: `sr-job:${job.id}`,
    provider: "smartrecruiters",
    title: job.title ?? "",
    location: job.location?.id ?? null,
    department: job.department?.label ?? null,
    type: job.type?.label ?? null,
    createdAt: job.createdOn ?? null,
  };
}

interface SRJobsResponse {
  content?: SRJob[];
  totalFound?: number;
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
} {
  const data = raw as SRJobsResponse;
  const jobs = Array.isArray(data.content) ? data.content : [];
  const total = data.totalFound ?? null;
  return { jobs: jobs.map(normalizeJob), total };
}
