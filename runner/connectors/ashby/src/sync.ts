/**
 * Ashby jobs.list sync.
 */

import { createClient } from "./http";
import { parseJobsResponse, NormalizedJob } from "./objects";

export interface ExecuteJobsListSyncInput {
  boardName: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

export interface ExecuteJobsListSyncOutput {
  jobs: NormalizedJob[];
}

export async function executeJobsListSync(
  input: ExecuteJobsListSyncInput,
): Promise<ExecuteJobsListSyncOutput> {
  const client = createClient({ boardName: input.boardName, fetch: input.fetch });
  const raw = await client.getJSON("/jobs");
  return { jobs: parseJobsResponse(raw) };
}
