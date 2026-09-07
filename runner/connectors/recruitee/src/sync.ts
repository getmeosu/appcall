/**
 * Recruitee jobs.list sync.
 */

import { createClient } from "./http";
import { parseJobsResponse, NormalizedJob } from "./objects";

export interface ExecuteJobsListSyncInput {
  company: string;
  accessToken: string;
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
  const client = createClient({
    company: input.company,
    accessToken: input.accessToken,
    fetch: input.fetch,
  });
  const raw = await client.getJSON("/offers");
  return parseJobsResponse(raw);
}
