import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);

const ALIAS_PAIRS: Array<[string, string]> = [
  ["employee_id", "employeeId"],
  ["coverage_id", "coverageId"],
  ["report_id", "reportId"],
  ["request_id", "requestId"],
  ["time_off_type_id", "timeOffTypeId"],
  ["job_id", "jobId"],
  ["first_name", "firstName"],
  ["last_name", "lastName"],
  ["file_name", "fileName"],
  ["raw_content", "rawContent"],
  ["raw_mimetype", "rawMimetype"],
  ["only_current", "onlyCurrent"],
  ["job_status", "jobStatus"],
  ["hiring_lead", "hiringLead"],
  ["job_location", "jobLocation"],
  ["employment_type", "employmentType"],
  ["posting_title", "postingTitle"],
  ["job_description", "jobDescription"],
  ["sort_by", "sortBy"],
  ["sort_order", "sortOrder"],
  ["status_groups", "statusGroups"],
  ["application_status", "applicationStatus"],
  ["application_status_id", "applicationStatusId"],
  ["job_status_groups", "jobStatusGroups"],
  ["previous_request", "previousRequest"],
  ["date_of_birth", "dateOfBirth"],
  ["zip_code", "zipCode"],
  ["home_phone", "homePhone"],
  ["is_student", "isStudent"],
  ["middle_name", "middleName"],
  ["is_us_citizen", "isUsCitizen"],
  ["address_line1", "addressLine1"],
  ["address_line2", "addressLine2"],
  ["work_email", "workEmail"],
  ["job_title", "jobTitle"],
  ["hire_date", "hireDate"],
  ["employee_number", "employeeNumber"],
  ["website_url", "websiteUrl"],
  ["linkedin_url", "linkedinUrl"],
  ["phone_number", "phoneNumber"],
  ["date_available", "dateAvailable"],
  ["desired_salary", "desiredSalary"],
  ["highest_education", "highestEducation"],
  ["college_name", "collegeName"],
  ["cover_letter", "coverLetter"],
  ["referred_by", "referredBy"],
  ["end_date", "endDate"],
  ["max_employees", "maxEmployees"],
  ["name_contains", "nameContains"],
  ["include_archived", "includeArchived"],
  ["internal_job_code", "internalJobCode"],
  ["minimum_experience", "minimumExperience"],
  ["filters_last_changed_value", "filtersLastChangedValue"],
  ["filters_last_changed_include_null", "filtersLastChangedIncludeNull"],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function aliasBambooInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const out: Record<string, unknown> = { ...input };
  for (const [snake, camel] of ALIAS_PAIRS) {
    if (!present(out[camel]) && present(out[snake])) out[camel] = out[snake];
    if (snake !== camel) delete out[snake];
  }
  if (!present(out.employeeId) && Array.isArray(out.employee_ids) && out.employee_ids.length > 0) {
    out.employeeId = String(out.employee_ids[0]);
  }
  return out;
}

function wrap(handler: (input: unknown) => unknown): (input: unknown) => unknown {
  return (input: unknown) => handler(aliasBambooInput(input));
}

function httpClient(input: Record<string, unknown>, timeoutMs: number, maxResponseBytes: number) {
  return createConnectorHttpClient({
    allowedHosts: (manifest.network.allowedHosts as string[]) ?? [],
    maxResponseBytes,
    timeoutMs,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
  });
}

function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:x`, "utf8").toString("base64")}`;
}

function fail(status: number, body: string, headers: Record<string, string>): never {
  if (status === 429) {
    const retry = Number(headers["retry-after"] ?? "30");
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "BambooHR rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retry) ? retry : 30,
    };
  }
  let message = "BambooHR request failed.";
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.message === "string") message = parsed.message;
    else if (typeof parsed.error === "string") message = parsed.error;
  } catch {
    if (body.trim()) message = body.slice(0, 300);
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

function parseJson(body: string): unknown {
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function domainOf(input: Record<string, unknown>): string {
  const domain = String(input.companyDomain ?? "");
  if (!domain) throw { ok: false, code: "INVALID_ACTION_INPUT", message: "companyDomain is required" };
  return domain;
}

async function filesUpload(input: unknown): Promise<unknown> {
  const aliased = aliasBambooInput(input);
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") {
    return compiled.actions["files.upload"]!(aliased);
  }
  if (!present(aliased.rawContent) && !isRecord(aliased.file)) {
    return compiled.actions["files.upload"]!(aliased);
  }
  const category = String(aliased.category ?? "");
  const fileName = String(aliased.fileName ?? "");
  const share = String(aliased.share ?? "");
  if (!category || !fileName || !share) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "category, fileName, and share are required" };
  }
  const form = new FormData();
  form.set("category", category);
  form.set("fileName", fileName);
  form.set("share", share);
  const raw = String(aliased.rawContent ?? "");
  const mime = String(aliased.rawMimetype ?? "application/octet-stream");
  form.set("file", new Blob([raw], { type: mime }), fileName);
  const client = httpClient(aliased, 15000, 1048576);
  let response;
  try {
    response = await client.fetchText(`https://${domainOf(aliased)}.bamboohr.com/api/v1/files`, {
      method: "POST",
      headers: { Authorization: basicAuth(String(aliased.apiKey)), Accept: "application/json" },
      body: form,
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (![200, 201, 204].includes(response.status)) fail(response.status, response.body, response.headers);
  return {
    connector: "bamboohr",
    action: "files.upload",
    source: "provider",
    data: { status: response.status, location: response.headers.location ?? null },
  };
}

async function atsCreateCandidate(input: unknown): Promise<unknown> {
  const aliased = aliasBambooInput(input);
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") {
    return compiled.actions["ats.create_candidate"]!(aliased);
  }
  if (!isRecord(aliased.resume) && !isRecord(aliased.coverLetter)) {
    return compiled.actions["ats.create_candidate"]!(aliased);
  }
  const form = new FormData();
  for (const key of [
    "jobId",
    "firstName",
    "lastName",
    "email",
    "phoneNumber",
    "address",
    "city",
    "state",
    "zip",
    "country",
    "source",
    "references",
    "referredBy",
    "websiteUrl",
    "linkedinUrl",
    "collegeName",
    "dateAvailable",
    "desiredSalary",
    "highestEducation",
  ]) {
    if (present(aliased[key])) form.set(key, String(aliased[key]));
  }
  if (isRecord(aliased.resume) && present(aliased.resume.content)) {
    form.set("resume", new Blob([String(aliased.resume.content)], { type: String(aliased.resume.type ?? "application/pdf") }), String(aliased.resume.name ?? "resume.pdf"));
  }
  if (isRecord(aliased.coverLetter) && present(aliased.coverLetter.content)) {
    form.set("coverLetter", new Blob([String(aliased.coverLetter.content)], { type: String(aliased.coverLetter.type ?? "text/plain") }), String(aliased.coverLetter.name ?? "cover.txt"));
  }
  const client = httpClient(aliased, 15000, 1048576);
  let response;
  try {
    response = await client.fetchText(`https://${domainOf(aliased)}.bamboohr.com/api/v1/applicant_tracking/application`, {
      method: "POST",
      headers: { Authorization: basicAuth(String(aliased.apiKey)), Accept: "application/json" },
      body: form,
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (![200, 201].includes(response.status)) fail(response.status, response.body, response.headers);
  return { connector: "bamboohr", action: "ats.create_candidate", source: "provider", data: parseJson(response.body) };
}

async function employeesPhoto(input: unknown): Promise<unknown> {
  const aliased = aliasBambooInput(input);
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string") {
    return compiled.actions["employees.photo"]!(aliased);
  }
  const employeeId = String(aliased.employeeId ?? "");
  const size = String(aliased.size ?? "");
  if (!employeeId || !size) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "employeeId and size are required" };
  }
  const client = httpClient(aliased, 15000, 5242880);
  let response;
  try {
    response = await client.fetchText(
      `https://${domainOf(aliased)}.bamboohr.com/api/v1/employees/${encodeURIComponent(employeeId)}/photo/${encodeURIComponent(size)}`,
      { method: "GET", headers: { Authorization: basicAuth(String(aliased.apiKey)), Accept: "application/json" } },
    );
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (![200].includes(response.status)) fail(response.status, response.body, response.headers);
  const contentType = response.headers["content-type"] ?? "";
  const trimmed = response.body.trim();
  const data =
    contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")
      ? parseJson(response.body)
      : { encoding: "base64", contentType, bytes: Buffer.from(response.body, "binary").toString("base64") };
  return { connector: "bamboohr", action: "employees.photo", source: "provider", data };
}

async function benefitGetCoverages(input: unknown): Promise<unknown> {
  const aliased = aliasBambooInput(input);
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string" || !present(aliased.coverageId)) {
    return compiled.actions["benefit.get_coverages"]!(aliased);
  }
  const client = httpClient(aliased, 15000, 5242880);
  let response;
  try {
    response = await client.fetchText(
      `https://${domainOf(aliased)}.bamboohr.com/api/v1/benefitcoverages/${encodeURIComponent(String(aliased.coverageId))}`,
      { method: "GET", headers: { Authorization: basicAuth(String(aliased.apiKey)), Accept: "application/json" } },
    );
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (response.status !== 200) fail(response.status, response.body, response.headers);
  return { connector: "bamboohr", action: "benefit.get_coverages", source: "provider", data: parseJson(response.body) };
}

async function reportsCustom(input: unknown): Promise<unknown> {
  const aliased = aliasBambooInput(input);
  if (!isRecord(aliased) || typeof aliased.apiKey !== "string" || !present(aliased.reportId)) {
    return compiled.actions["reports.custom"]!(aliased);
  }
  const format = String(aliased.format ?? "JSON");
  const url = new URL(`https://${domainOf(aliased)}.bamboohr.com/api/v1/reports/${encodeURIComponent(String(aliased.reportId))}`);
  url.searchParams.set("format", format);
  url.searchParams.set("fd", "yes");
  const client = httpClient(aliased, 30000, 5242880);
  let response;
  try {
    response = await client.fetchText(url, {
      method: "GET",
      headers: { Authorization: basicAuth(String(aliased.apiKey)), Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (response.status !== 200) fail(response.status, response.body, response.headers);
  return { connector: "bamboohr", action: "reports.custom", source: "provider", data: parseJson(response.body) };
}

export const actions: Record<string, (input: unknown) => unknown> = {};
for (const [key, handler] of Object.entries(compiled.actions)) {
  if (key === "files.upload") actions[key] = filesUpload;
  else if (key === "ats.create_candidate") actions[key] = atsCreateCandidate;
  else if (key === "employees.photo") actions[key] = employeesPhoto;
  else if (key === "benefit.get_coverages") actions[key] = benefitGetCoverages;
  else if (key === "reports.custom") actions[key] = reportsCustom;
  else actions[key] = wrap(handler);
}

export const healthcheck = actions.healthcheck!;
