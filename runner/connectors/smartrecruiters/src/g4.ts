/**
 * SmartRecruiters G4 — configuration + public lookups (14 read ops, v0.7.0).
 *
 * Customer API calls use X-SmartToken on https://api.smartrecruiters.com
 * (createApiClient); postings.departments.list uses the public Posting API
 * (createClient, no credentials). Official references:
 *
 *   departments.list            GET /configuration/departments                    configurationdepartmentall-1
 *   departments.get             GET /configuration/departments/{id}               configurationdepartmentget-1
 *   hiring_processes.list       GET /configuration/hiring-processes               configurationhiring-processall-1
 *   hiring_processes.get        GET /configuration/hiring-processes/{id}          configurationhiring-processget-1
 *   rejection_reasons.list      GET /configuration/rejection-reasons              configurationreasonsrejectionall-1
 *   withdrawal_reasons.list     GET /configuration/withdrawal-reasons             configurationreasonswithdrawalall-1
 *   sources.types.list          GET /configuration/sources                        configurationsourcetypes-1
 *   sources.values.list         GET /configuration/sources/{sourceType}/values    configurationsourcevaluesall-1
 *   candidate_properties.list   GET /configuration/candidate-properties           configurationcandidate-propertiesall-1
 *   job_properties.list         GET /configuration/job-properties                 configurationjob-propertiesall-1
 *   job_properties.values.list  GET /configuration/job-properties/{id}/values     configurationjob-propertiesvaluesget-1
 *   offer_properties.list       GET /configuration/offer-properties               configurationoffer-propertiesall-1
 *   company.get                 GET /configuration/company                        configurationcompanymy-1
 *   postings.departments.list   GET /v1/companies/{companyIdentifier}/departments v1listdepartments
 *
 * All reads: no effect keys. Paging per the docs: job_properties.values.list is
 * cursor-paged (pageId / pageSize, body nextPageId); sources.values.list is
 * offset/limit only; the other lists are unpaged.
 *
 * None of these ids (department, hiring process, reason, source, property) has
 * a prefixed form in any connector output, so they are passed through
 * assertSafePathSegment unchanged and emitted raw.
 */
import { assertSafePathSegment } from "../../_shared/jobboard";
import { createApiClient, createClient } from "./http";
import { pageIdParam } from "./paging";

export interface SmartRecruitersG4AuthInput {
  apiKey: string;
  /** Injected by tests; production leaves it unset. */
  fetch?: typeof fetch;
}

const CONFIG = "/configuration";

function client(input: SmartRecruitersG4AuthInput, operation: string) {
  return createApiClient({ apiKey: input.apiKey, fetch: input.fetch, operation });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function seg(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  return assertSafePathSegment(value, field);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function intParam(value: unknown, field: string, min: number, max?: number): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || (max != null && value > max)) {
    throw new Error(max != null ? `${field} must be an integer ${min}-${max}` : `${field} must be an integer >= ${min}`);
  }
  return String(value);
}

function listOf(raw: unknown): { data: Record<string, unknown>; items: Record<string, unknown>[] } {
  const data = isRecord(raw) ? raw : {};
  return { data, items: Array.isArray(data.content) ? data.content.filter(isRecord) : [] };
}

function totalOf(data: Record<string, unknown>, items: unknown[]): number {
  return typeof data.totalFound === "number" ? data.totalFound : items.length;
}

function query(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, v);
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : "";
}

// ---------------------------------------------------------------------------
// departments
// ---------------------------------------------------------------------------

export interface Department {
  id: string | null;
  label: string | null;
  description: string | null;
  archived: boolean | null;
}

function department(raw: Record<string, unknown>): Department {
  return { id: str(raw.id), label: str(raw.label), description: str(raw.description), archived: bool(raw.archived) };
}

export async function executeDepartmentsList(
  input: SmartRecruitersG4AuthInput,
): Promise<{ departments: Department[]; total: number }> {
  const { data, items } = listOf(await client(input, "departments.list").getJSON(`${CONFIG}/departments`));
  return { departments: items.map(department), total: totalOf(data, items) };
}

export async function executeDepartmentsGet(
  input: SmartRecruitersG4AuthInput & { id: string },
): Promise<{ department: Department | null }> {
  const id = seg(input.id, "id");
  const raw = await client(input, "departments.get").getJSON(`${CONFIG}/departments/${id}`);
  return { department: isRecord(raw) && str(raw.label) != null ? department(raw) : null };
}

// ---------------------------------------------------------------------------
// hiring processes
// ---------------------------------------------------------------------------

export interface HiringProcess {
  id: string | null;
  name: string | null;
  active: boolean | null;
  subStatuses: Record<string, string[]>;
}

function hiringProcess(raw: Record<string, unknown>): HiringProcess {
  const subStatuses: Record<string, string[]> = {};
  if (isRecord(raw.subStatuses)) {
    for (const [k, v] of Object.entries(raw.subStatuses)) subStatuses[k] = strings(v);
  }
  return { id: str(raw.id), name: str(raw.name), active: bool(raw.active), subStatuses };
}

export async function executeHiringProcessesList(
  input: SmartRecruitersG4AuthInput,
): Promise<{ hiringProcesses: HiringProcess[]; total: number }> {
  const { data, items } = listOf(await client(input, "hiring_processes.list").getJSON(`${CONFIG}/hiring-processes`));
  return { hiringProcesses: items.map(hiringProcess), total: totalOf(data, items) };
}

export async function executeHiringProcessesGet(
  input: SmartRecruitersG4AuthInput & { id: string },
): Promise<{ hiringProcess: HiringProcess | null }> {
  const id = seg(input.id, "id");
  const raw = await client(input, "hiring_processes.get").getJSON(`${CONFIG}/hiring-processes/${id}`);
  return { hiringProcess: isRecord(raw) && str(raw.id) != null ? hiringProcess(raw) : null };
}

// ---------------------------------------------------------------------------
// rejection / withdrawal reasons
// ---------------------------------------------------------------------------

export interface Reason {
  id: string;
  label: string | null;
}

async function reasons(
  input: SmartRecruitersG4AuthInput,
  operation: string,
  path: string,
): Promise<{ reasons: Reason[]; total: number }> {
  const { data, items } = listOf(await client(input, operation).getJSON(path));
  const rows = items.filter((r) => str(r.id) != null).map((r) => ({ id: r.id as string, label: str(r.label) }));
  return { reasons: rows, total: totalOf(data, rows) };
}

export function executeRejectionReasonsList(input: SmartRecruitersG4AuthInput) {
  return reasons(input, "rejection_reasons.list", `${CONFIG}/rejection-reasons`);
}

export function executeWithdrawalReasonsList(input: SmartRecruitersG4AuthInput) {
  return reasons(input, "withdrawal_reasons.list", `${CONFIG}/withdrawal-reasons`);
}

// ---------------------------------------------------------------------------
// candidate sources
// ---------------------------------------------------------------------------

export interface SourceType {
  id: string;
  label: string | null;
  subtypes: string[];
}

export async function executeSourcesTypesList(
  input: SmartRecruitersG4AuthInput,
): Promise<{ sourceTypes: SourceType[]; total: number }> {
  const { data, items } = listOf(await client(input, "sources.types.list").getJSON(`${CONFIG}/sources`));
  const rows = items
    .filter((t) => str(t.id) != null)
    .map((t) => ({
      id: t.id as string,
      label: str(t.label),
      subtypes: (Array.isArray(t.subtypes) ? t.subtypes.filter(isRecord) : []).map((s) => str(s.id)).filter((s): s is string => s != null),
    }));
  return { sourceTypes: rows, total: totalOf(data, rows) };
}

export interface SourceValue {
  id: string;
  label: string | null;
  sourceIdentifier: string | null;
  sourceSubType: string | null;
}

export async function executeSourcesValuesList(
  input: SmartRecruitersG4AuthInput & { sourceType: string; sourceSubType?: string; limit?: number; offset?: number },
): Promise<{ sources: SourceValue[]; total: number; limit: number | null; offset: number | null }> {
  const sourceType = seg(input.sourceType, "sourceType");
  // Offset/limit paging only (configurationsourcevaluesall-1 documents no pageId).
  const qs = query({
    sourceSubType: optionalString(input.sourceSubType, "sourceSubType"),
    limit: intParam(input.limit, "limit", 1, 100),
    offset: intParam(input.offset, "offset", 0),
  });
  const { data, items } = listOf(
    await client(input, "sources.values.list").getJSON(`${CONFIG}/sources/${sourceType}/values${qs}`),
  );
  const rows = items
    .filter((v) => str(v.id) != null)
    .map((v) => ({
      id: v.id as string,
      label: str(v.label),
      sourceIdentifier: str(v.sourceIdentifier),
      sourceSubType: isRecord(v.sourceSubType) ? str(v.sourceSubType.id) : null,
    }));
  return {
    sources: rows,
    total: totalOf(data, rows),
    limit: typeof data.limit === "number" ? data.limit : null,
    offset: typeof data.offset === "number" ? data.offset : null,
  };
}

// ---------------------------------------------------------------------------
// property definitions
// ---------------------------------------------------------------------------

export interface CandidatePropertyDefinition {
  id: string | null;
  key: string | null;
  label: string | null;
  type: string | null;
  availableTo: string | null;
  contexts: string[];
}

export async function executeCandidatePropertiesList(
  input: SmartRecruitersG4AuthInput,
): Promise<{ properties: CandidatePropertyDefinition[]; total: number }> {
  const { data, items } = listOf(
    await client(input, "candidate_properties.list").getJSON(`${CONFIG}/candidate-properties`),
  );
  const rows = items.map((p) => {
    const availability = isRecord(p.availability) ? p.availability : {};
    return {
      id: str(p.id),
      key: str(p.key),
      label: str(p.label),
      type: str(p.type),
      availableTo: str(availability.toUsers),
      contexts: strings(availability.context),
    };
  });
  return { properties: rows, total: totalOf(data, rows) };
}

export interface JobPropertyDefinition {
  id: string | null;
  key: string | null;
  label: string | null;
  category: string | null;
  active: boolean | null;
  visible: boolean | null;
  required: boolean | null;
}

export async function executeJobPropertiesList(
  input: SmartRecruitersG4AuthInput,
): Promise<{ properties: JobPropertyDefinition[]; total: number }> {
  const { data, items } = listOf(await client(input, "job_properties.list").getJSON(`${CONFIG}/job-properties`));
  const rows = items.map((p) => ({
    id: str(p.id),
    key: str(p.key),
    label: str(p.label),
    category: str(p.category),
    active: bool(p.active),
    visible: bool(p.visible),
    required: bool(p.required),
  }));
  return { properties: rows, total: totalOf(data, rows) };
}

export interface JobPropertyValue {
  id: string | null;
  label: string | null;
  archived: boolean | null;
  externalCode: string | null;
}

export async function executeJobPropertiesValuesList(
  input: SmartRecruitersG4AuthInput & { id: string; pageId?: string; pageSize?: number },
): Promise<{ values: JobPropertyValue[]; total: number; nextPageId: string | null }> {
  const id = seg(input.id, "id");
  const qs = query({
    pageId: pageIdParam(input.pageId, "pageId"),
    pageSize: intParam(input.pageSize, "pageSize", 1, 20000),
  });
  const page = await client(input, "job_properties.values.list").getPage(`${CONFIG}/job-properties/${id}/values${qs}`);
  const { data, items } = listOf(page.data);
  const rows = items.map((v) => ({
    id: str(v.id),
    label: str(v.label),
    archived: bool(v.archived),
    externalCode: str(v.externalCode),
  }));
  return { values: rows, total: totalOf(data, rows), nextPageId: page.nextPageId };
}

export interface OfferPropertyCategory {
  id: string | null;
  properties: Array<{ key: string | null; label: string | null; required: boolean | null; type: string | null }>;
}

export async function executeOfferPropertiesList(
  input: SmartRecruitersG4AuthInput,
): Promise<{ categories: OfferPropertyCategory[] }> {
  const raw = await client(input, "offer_properties.list").getJSON(`${CONFIG}/offer-properties`);
  const data = isRecord(raw) ? raw : {};
  const categories = (Array.isArray(data.categories) ? data.categories.filter(isRecord) : []).map((c) => ({
    id: str(c.id),
    properties: (Array.isArray(c.properties) ? c.properties.filter(isRecord) : []).map((p) => ({
      key: str(p.key),
      label: str(p.label),
      required: bool(p.required),
      type: str(p.type),
    })),
  }));
  return { categories };
}

// ---------------------------------------------------------------------------
// company.get
// ---------------------------------------------------------------------------

export interface CompanyConfiguration {
  identifier: string | null;
  name: string | null;
  website: string | null;
  logo: string | null;
  industry: string | null;
  location: { city: string | null; region: string | null; country: string | null; countryCode: string | null } | null;
}

export async function executeCompanyGet(
  input: SmartRecruitersG4AuthInput,
): Promise<{ company: CompanyConfiguration | null }> {
  const raw = await client(input, "company.get").getJSON(`${CONFIG}/company`);
  if (!isRecord(raw)) return { company: null };
  const loc = isRecord(raw.location) ? raw.location : null;
  return {
    company: {
      identifier: str(raw.identifier),
      name: str(raw.name),
      website: str(raw.website),
      logo: str(raw.logo),
      industry: isRecord(raw.industry) ? str(raw.industry.label) : null,
      location: loc
        ? { city: str(loc.city), region: str(loc.region), country: str(loc.country), countryCode: str(loc.countryCode) }
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// postings.departments.list — public Posting API
// ---------------------------------------------------------------------------

export async function executePostingsDepartmentsList(input: {
  company: string;
  fetch?: typeof fetch;
}): Promise<{ departments: Array<{ id: string | null; label: string | null; description: string | null }>; total: number }> {
  const raw = await createClient({ company: input.company, fetch: input.fetch }).getJSON("/departments");
  const { data, items } = listOf(raw);
  const rows = items.map((d) => ({ id: str(d.id), label: str(d.label), description: str(d.description) }));
  return { departments: rows, total: totalOf(data, rows) };
}
