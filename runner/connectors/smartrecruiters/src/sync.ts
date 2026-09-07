/**
 * SmartRecruiters jobs.list sync.
 */

import { createClient } from "./http";
import { parseJobsResponse, NormalizedJob } from "./objects";

export interface ExecuteJobsListSyncInput {
  company: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export interface ExecuteJobsListSyncOutput {
  jobs: NormalizedJob[];
  total: number | null;
}

export async function executeJobsListSync(
  input: ExecuteJobsListSyncInput,
): Promise<ExecuteJobsListSyncOutput> {
  const client = createClient({ company: input.company, fetch: input.fetch });
  const raw = await client.getJSON("/postings");
  return parseJobsResponse(raw);
}
