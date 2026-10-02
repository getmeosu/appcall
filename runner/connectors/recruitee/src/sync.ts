/**
 * Recruitee list syncs.
 *
 * jobs.list              -> Careers Site API GET /offers -> NormalizedJob
 * offers.list            -> ATS API GET /offers -> NormalizedOffer (admin listing)
 * candidates.list        -> ATS API GET /candidates
 * candidates.get         -> ATS API GET /candidates/{id}
 * candidates.search      -> ATS API GET /search/new/candidates
 * interview_events.list  -> ATS API GET /interview/events
 * pipeline_stages.list   -> ATS stages from offer / pipeline template(s)
 */

import { createClient, createAtsClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";
import {
  parseJobsResponse,
  parseCandidatesResponse,
  parseCandidateGetResponse,
  parseCandidatesSearchResponse,
  parseOffersResponse,
  parseStagesFromOfferResponse,
  parseStagesFromPipelineTemplateResponse,
  parsePipelineTemplatesList,
  parseInterviewEventsResponse,
  dedupeStages,
  type NormalizedJob,
  type NormalizedCandidate,
  type NormalizedOffer,
  type NormalizedPipelineStage,
  type NormalizedInterviewEvent,
} from "./objects";

export interface RecruiteeAuthInput {
  company: string;
  accessToken: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

// ---------------------------------------------------------------------------
// jobs.list — Careers /offers → NormalizedJob (unchanged contract)
// ---------------------------------------------------------------------------

export interface ExecuteJobsListSyncInput extends RecruiteeAuthInput {}

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
    operation: "jobs.list",
  });
  const raw = await client.getJSON("/offers");
  return parseJobsResponse(raw);
}

// ---------------------------------------------------------------------------
// candidates.list — ATS /candidates
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListSyncInput extends RecruiteeAuthInput {
  limit?: number;
  offset?: number;
  offerId?: string;
  query?: string;
}

export interface ExecuteCandidatesListSyncOutput {
  candidates: NormalizedCandidate[];
  limit: number | null;
  offset: number | null;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") qs.set(key, value);
  }
  const encoded = qs.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

export async function executeCandidatesListSync(
  input: ExecuteCandidatesListSyncInput,
): Promise<ExecuteCandidatesListSyncOutput> {
  const client = createAtsClient({
    company: input.company,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "candidates.list",
  });
  const path =
    "/candidates" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      offset: input.offset != null ? String(input.offset) : undefined,
      offer_id: input.offerId,
      query: input.query,
    });
  const raw = await client.getJSON(path);
  return parseCandidatesResponse(raw);
}

// ---------------------------------------------------------------------------
// offers.list — ATS /offers (richer admin listing; distinct from jobs.list)
// ---------------------------------------------------------------------------

export interface ExecuteOffersListSyncInput extends RecruiteeAuthInput {
  scope?: string;
  viewMode?: string;
}

export interface ExecuteOffersListSyncOutput {
  offers: NormalizedOffer[];
  total: number | null;
}

export async function executeOffersListSync(
  input: ExecuteOffersListSyncInput,
): Promise<ExecuteOffersListSyncOutput> {
  const client = createAtsClient({
    company: input.company,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "offers.list",
  });
  const path =
    "/offers" +
    buildQuery({
      scope: input.scope,
      view_mode: input.viewMode,
    });
  const raw = await client.getJSON(path);
  return parseOffersResponse(raw);
}

// ---------------------------------------------------------------------------
// pipeline_stages.list — stages from offer or pipeline template(s)
// ---------------------------------------------------------------------------

export interface ExecutePipelineStagesListSyncInput extends RecruiteeAuthInput {
  /** When set, stages come from GET /offers/{offerId}.pipeline_template.stages */
  offerId?: string;
  /** When set (and no offerId), stages come from GET /pipeline_templates/{id} */
  pipelineTemplateId?: string;
}

export interface ExecutePipelineStagesListSyncOutput {
  stages: NormalizedPipelineStage[];
  total: number;
}

export async function executePipelineStagesListSync(
  input: ExecutePipelineStagesListSyncInput,
): Promise<ExecutePipelineStagesListSyncOutput> {
  const client = createAtsClient({
    company: input.company,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "pipeline_stages.list",
  });

  if (input.offerId) {
    const offerId = encodeURIComponent(String(input.offerId));
    const raw = await client.getJSON(`/offers/${offerId}`);
    const { stages } = parseStagesFromOfferResponse(raw);
    return { stages, total: stages.length };
  }

  if (input.pipelineTemplateId) {
    const templateId = encodeURIComponent(String(input.pipelineTemplateId));
    const raw = await client.getJSON(`/pipeline_templates/${templateId}`);
    const { stages } = parseStagesFromPipelineTemplateResponse(raw);
    return { stages, total: stages.length };
  }

  // Default: list templates, use embedded stages when present, otherwise fetch
  // each template detail and flatten (deduped by stage id).
  const listRaw = await client.getJSON("/pipeline_templates");
  const { templates } = parsePipelineTemplatesList(listRaw);
  const collected: NormalizedPipelineStage[] = [];

  for (const template of templates) {
    if (template.stages.length > 0) {
      collected.push(...template.stages);
      continue;
    }
    const detail = await client.getJSON(
      `/pipeline_templates/${encodeURIComponent(template.id)}`,
    );
    collected.push(...parseStagesFromPipelineTemplateResponse(detail).stages);
  }

  const stages = dedupeStages(collected);
  return { stages, total: stages.length };
}

// ---------------------------------------------------------------------------
// candidates.get — ATS /candidates/{id}
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesGetSyncInput extends RecruiteeAuthInput {
  /** Recruitee candidate id (numeric). */
  id: string;
}

export interface ExecuteCandidatesGetSyncOutput {
  candidate: NormalizedCandidate | null;
}

export async function executeCandidatesGetSync(
  input: ExecuteCandidatesGetSyncInput,
): Promise<ExecuteCandidatesGetSyncOutput> {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAtsClient({
    company: input.company,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "candidates.get",
  });
  const raw = await client.getJSON(`/candidates/${id}`);
  return parseCandidateGetResponse(raw);
}

// ---------------------------------------------------------------------------
// candidates.search — ATS /search/new/candidates
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesSearchSyncInput extends RecruiteeAuthInput {
  /** Free-text query mapped to filters_json [{"field":"all","query":...}]. */
  query?: string;
  /** Pre-serialized filters_json array string (takes precedence over query). */
  filtersJson?: string;
  limit?: number;
  page?: number;
  sortBy?: string;
}

export interface ExecuteCandidatesSearchSyncOutput {
  candidates: NormalizedCandidate[];
  total: number | null;
}

export async function executeCandidatesSearchSync(
  input: ExecuteCandidatesSearchSyncInput,
): Promise<ExecuteCandidatesSearchSyncOutput> {
  const client = createAtsClient({
    company: input.company,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "candidates.search",
  });

  let filtersJson = input.filtersJson;
  if ((filtersJson == null || filtersJson === "") && input.query) {
    filtersJson = JSON.stringify([{ field: "all", query: input.query }]);
  }

  const path =
    "/search/new/candidates" +
    buildQuery({
      limit: input.limit != null ? String(input.limit) : undefined,
      page: input.page != null ? String(input.page) : undefined,
      sort_by: input.sortBy,
      filters_json: filtersJson,
    });
  const raw = await client.getJSON(path);
  return parseCandidatesSearchResponse(raw);
}

// ---------------------------------------------------------------------------
// interview_events.list — ATS /interview/events
// ---------------------------------------------------------------------------

export interface ExecuteInterviewEventsListSyncInput extends RecruiteeAuthInput {
  candidateId?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  scope?: string;
  status?: string;
  /** Comma-separated or single admin id; forwarded as admin_ids. */
  adminIds?: string;
  limit?: number;
  page?: number;
}

export interface ExecuteInterviewEventsListSyncOutput {
  events: NormalizedInterviewEvent[];
  total: number;
  pastDue: number | null;
  upcoming: number | null;
}

export async function executeInterviewEventsListSync(
  input: ExecuteInterviewEventsListSyncInput,
): Promise<ExecuteInterviewEventsListSyncOutput> {
  const client = createAtsClient({
    company: input.company,
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation: "interview_events.list",
  });
  const path =
    "/interview/events" +
    buildQuery({
      candidate_id: input.candidateId,
      start_date: input.startDate,
      end_date: input.endDate,
      timezone: input.timezone,
      scope: input.scope,
      status: input.status,
      admin_ids: input.adminIds,
      limit: input.limit != null ? String(input.limit) : undefined,
      page: input.page != null ? String(input.page) : undefined,
    });
  const raw = await client.getJSON(path);
  return parseInterviewEventsResponse(raw);
}
