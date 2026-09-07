import { parseJobsResponse } from "./objects";
import type { NormalizedJob } from "./objects";

export type JobsListSyncInput = { response: unknown };
export type JobsListSyncResult = { provider: "zoho-recruit"; operation: "jobs.list"; items: NormalizedJob[]; total: number | null; hasMore: boolean; page: number | null };

export function executeJobsListSync(input: JobsListSyncInput): JobsListSyncResult {
  const parsed = parseJobsResponse(input.response);
  return { provider: "zoho-recruit", operation: "jobs.list", items: parsed.jobs, total: parsed.total, hasMore: parsed.hasMore, page: parsed.page };
}
