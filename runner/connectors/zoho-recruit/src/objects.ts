/**
 * Zoho Recruit object normalization.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  jobType: string | null;
  hiringManager: string | null;
  description: string | null;
  status: string | null;
  createdAt: string | null;
}

interface ZohoJob {
  id: string;
  Job_Title?: string | null;
  Job_Type?: string | null;
  Hiring_Manager?: { name?: string } | null;
  Description?: string | null;
  Status?: string | null;
  Created_Time?: string | null;
}

export function normalizeJob(job: ZohoJob): NormalizedJob {
  return {
    id: `zr-job:${job.id}`,
    provider: "zoho-recruit",
    title: job.Job_Title ?? "",
    jobType: job.Job_Type ?? null,
    hiringManager: job.Hiring_Manager?.name ?? null,
    description: job.Description ?? null,
    status: job.Status ?? null,
    createdAt: job.Created_Time ?? null,
  };
}

interface ZohoJobsResponse {
  data?: ZohoJob[];
  info?: {
    count?: number;
    has_more?: boolean;
    page?: number;
  };
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
  hasMore: boolean;
  page: number | null;
} {
  if (!raw || typeof raw !== "object") return { jobs: [], total: null, hasMore: false, page: null };
  const data = raw as ZohoJobsResponse;
  const jobs = Array.isArray(data.data) ? data.data : [];
  return {
    jobs: jobs.map(normalizeJob),
    total: data.info?.count ?? null,
    hasMore: data.info?.has_more ?? false,
    page: data.info?.page ?? null,
  };
}
