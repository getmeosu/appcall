/**
 * Recruitee object normalization.
 *
 * Naming note: careers `jobs.list` GETs `/offers` and maps each offer into
 * NormalizedJob (public career posting). Authenticated `offers.list` GETs the
 * ATS `/offers` collection and maps into NormalizedOffer (richer admin fields).
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  department: string | null;
  employmentType: string | null;
  url: string | null;
  createdAt: string | null;
}

export interface NormalizedCandidate {
  id: string;
  provider: string;
  name: string;
  emails: string[];
  phones: string[];
  source: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  placements: Array<{
    id: string;
    offerId: string | null;
    stageId: string | null;
  }>;
}

export interface NormalizedOffer {
  id: string;
  provider: string;
  title: string;
  status: string | null;
  kind: string | null;
  slug: string | null;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  careersUrl: string | null;
  pipelineTemplateId: string | null;
  candidatesCount: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedPipelineStage {
  id: string;
  provider: string;
  name: string;
  category: string | null;
  group: string | null;
  position: number | null;
  pipelineTemplateId: string | null;
  offerId: string | null;
}

interface RecruiteeLocation {
  city?: string;
  country?: string;
}

interface RecruiteeJob {
  id: number;
  title?: string | null;
  location?: RecruiteeLocation | string | null;
  department?: { name?: string } | string | null;
  employment_type?: string | null;
  url?: string | null;
  created_at?: string | null;
}

function formatLocation(location: RecruiteeLocation | string | null | undefined): string | null {
  if (location == null) return null;
  if (typeof location === "string") {
    const trimmed = location.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const parts = [location.city, location.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function departmentName(
  department: { name?: string } | string | null | undefined,
): string | null {
  if (department == null) return null;
  if (typeof department === "string") {
    const trimmed = department.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return department.name ?? null;
}

function asStringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

export function normalizeJob(job: RecruiteeJob): NormalizedJob {
  return {
    id: `rc-job:${job.id}`,
    provider: "recruitee",
    title: job.title ?? "",
    location: formatLocation(job.location),
    department: departmentName(job.department),
    employmentType: job.employment_type ?? null,
    url: job.url ?? null,
    createdAt: job.created_at ?? null,
  };
}

interface RecruiteeOffersResponse {
  offers?: RecruiteeJob[];
  total?: number;
}

export function parseJobsResponse(raw: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
} {
  const data = raw as RecruiteeOffersResponse;
  const offers = Array.isArray(data.offers) ? data.offers : [];
  const total = data.total ?? null;
  return { jobs: offers.map(normalizeJob), total };
}

interface RecruiteePlacement {
  id?: number | string;
  offer_id?: number | string | null;
  stage_id?: number | string | null;
}

interface RecruiteeCandidate {
  id: number | string;
  name?: string | null;
  emails?: unknown;
  phones?: unknown;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  placements?: RecruiteePlacement[] | null;
}

export function normalizeCandidate(candidate: RecruiteeCandidate): NormalizedCandidate {
  const placements = Array.isArray(candidate.placements) ? candidate.placements : [];
  return {
    id: `rc-candidate:${candidate.id}`,
    provider: "recruitee",
    name: candidate.name ?? "",
    emails: asStringArray(candidate.emails),
    phones: asStringArray(candidate.phones),
    source: candidate.source ?? null,
    createdAt: candidate.created_at ?? null,
    updatedAt: candidate.updated_at ?? null,
    placements: placements
      .map((p) => {
        const id = asStringId(p.id);
        if (!id) return null;
        return {
          id,
          offerId: asStringId(p.offer_id ?? null),
          stageId: asStringId(p.stage_id ?? null),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null),
  };
}

export function parseCandidatesResponse(raw: unknown): {
  candidates: NormalizedCandidate[];
  limit: number | null;
  offset: number | null;
} {
  const data = raw as {
    candidates?: RecruiteeCandidate[];
    limit?: number;
    offset?: number;
  };
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  return {
    candidates: candidates.map(normalizeCandidate),
    limit: typeof data.limit === "number" ? data.limit : null,
    offset: typeof data.offset === "number" ? data.offset : null,
  };
}

interface RecruiteeAtsOffer {
  id: number | string;
  title?: string | null;
  status?: string | null;
  kind?: string | null;
  slug?: string | null;
  department?: { name?: string } | string | null;
  location?: RecruiteeLocation | string | null;
  city?: string | null;
  country_code?: string | null;
  employment_type?: string | null;
  careers_url?: string | null;
  url?: string | null;
  pipeline_template_id?: number | string | null;
  candidates_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function normalizeOffer(offer: RecruiteeAtsOffer): NormalizedOffer {
  const location =
    formatLocation(offer.location) ??
    formatLocation(
      offer.city || offer.country_code
        ? { city: offer.city ?? undefined, country: offer.country_code ?? undefined }
        : null,
    );
  return {
    id: `rc-offer:${offer.id}`,
    provider: "recruitee",
    title: offer.title ?? "",
    status: offer.status ?? null,
    kind: offer.kind ?? null,
    slug: offer.slug ?? null,
    department: departmentName(offer.department),
    location,
    employmentType: offer.employment_type ?? null,
    careersUrl: offer.careers_url ?? offer.url ?? null,
    pipelineTemplateId: asStringId(offer.pipeline_template_id ?? null),
    candidatesCount: typeof offer.candidates_count === "number" ? offer.candidates_count : null,
    createdAt: offer.created_at ?? null,
    updatedAt: offer.updated_at ?? null,
  };
}

export function parseOffersResponse(raw: unknown): {
  offers: NormalizedOffer[];
  total: number | null;
} {
  const data = raw as { offers?: RecruiteeAtsOffer[]; total?: number };
  const offers = Array.isArray(data.offers) ? data.offers : [];
  return {
    offers: offers.map(normalizeOffer),
    total: typeof data.total === "number" ? data.total : null,
  };
}

interface RecruiteeStage {
  id: number | string;
  name?: string | null;
  category?: string | null;
  group?: string | null;
  position?: number | null;
}

export function normalizePipelineStage(
  stage: RecruiteeStage,
  opts: { pipelineTemplateId?: string | null; offerId?: string | null } = {},
): NormalizedPipelineStage {
  return {
    id: `rc-stage:${stage.id}`,
    provider: "recruitee",
    name: stage.name ?? "",
    category: stage.category ?? null,
    group: stage.group ?? null,
    position: typeof stage.position === "number" ? stage.position : null,
    pipelineTemplateId: opts.pipelineTemplateId ?? null,
    offerId: opts.offerId ?? null,
  };
}

function stagesFromTemplate(
  template: unknown,
  offerId: string | null = null,
): NormalizedPipelineStage[] {
  if (!template || typeof template !== "object") return [];
  const t = template as {
    id?: number | string;
    stages?: RecruiteeStage[];
  };
  const templateId = asStringId(t.id ?? null);
  const stages = Array.isArray(t.stages) ? t.stages : [];
  return stages.map((s) =>
    normalizePipelineStage(s, { pipelineTemplateId: templateId, offerId }),
  );
}

/** Parse stages embedded on an offer detail (`offer.pipeline_template.stages`). */
export function parseStagesFromOfferResponse(raw: unknown): {
  stages: NormalizedPipelineStage[];
} {
  const data = raw as { offer?: { id?: number | string; pipeline_template?: unknown } };
  const offer = data.offer;
  const offerId = asStringId(offer?.id ?? null);
  return { stages: stagesFromTemplate(offer?.pipeline_template, offerId) };
}

/** Parse stages from a pipeline_template detail response. */
export function parseStagesFromPipelineTemplateResponse(raw: unknown): {
  stages: NormalizedPipelineStage[];
} {
  const data = raw as { pipeline_template?: unknown };
  const template = data.pipeline_template ?? raw;
  return { stages: stagesFromTemplate(template, null) };
}

/**
 * Parse a pipeline_templates list. When each template already carries `stages`,
 * use them; otherwise callers fetch each template detail separately.
 */
export function parsePipelineTemplatesList(raw: unknown): {
  templates: Array<{ id: string; stages: NormalizedPipelineStage[] }>;
} {
  const data = raw as { pipeline_templates?: unknown[] };
  const list = Array.isArray(data.pipeline_templates) ? data.pipeline_templates : [];
  const templates: Array<{ id: string; stages: NormalizedPipelineStage[] }> = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = asStringId((item as { id?: unknown }).id);
    if (!id) continue;
    templates.push({
      id,
      stages: stagesFromTemplate(item, null),
    });
  }
  return { templates };
}

export function dedupeStages(stages: NormalizedPipelineStage[]): NormalizedPipelineStage[] {
  const seen = new Set<string>();
  const out: NormalizedPipelineStage[] = [];
  for (const stage of stages) {
    if (seen.has(stage.id)) continue;
    seen.add(stage.id);
    out.push(stage);
  }
  return out;
}
