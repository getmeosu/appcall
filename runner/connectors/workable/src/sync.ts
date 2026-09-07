/**
 * Workable jobs.list sync.
 */

import { createClient } from "./http";
import { parseJobsResponse, NormalizedJob } from "./objects";

export interface ExecuteJobsListSyncInput {
  account: string;
  accessToken: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export interface ExecuteJobsListSyncOutput {
  jobs: NormalizedJob[];
}

export async function executeJobsListSync(
  input: ExecuteJobsListSyncInput,
): Promise<ExecuteJobsListSyncOutput> {
  const client = createClient({
    account: input.account,
    accessToken: input.accessToken,
    fetch: input.fetch,
  });
  const raw = await client.getJSON("/jobs");
  return { jobs: parseJobsResponse(raw) };
}
