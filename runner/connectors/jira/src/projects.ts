import { prop } from "./http";

export type NormalizedProject = {
  id: string;
  provider: "jira";
  providerProjectId: string;
  key: string;
  name: string;
  description: string;
  projectTypeKey: string;
  style: string;
  leadId: string;
  leadName: string;
  isPrivate: boolean;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeProject(data: Record<string, unknown>): NormalizedProject {
  const lead = isRecord(data.lead) ? data.lead : {};
  const style = prop(data, "style");
  return {
    id: `jira-project:${prop(data, "id")}`,
    provider: "jira",
    providerProjectId: prop(data, "id"),
    key: prop(data, "key"),
    name: prop(data, "name"),
    description: prop(data, "description"),
    projectTypeKey: prop(data, "projectTypeKey"),
    style,
    leadId: prop(lead, "accountId"),
    leadName: prop(lead, "displayName"),
    isPrivate: style === "classic",
    modelVersion: "2026-05-16",
    raw: data,
  };
}

export function parseProjectsResponse(response: unknown): { projects: NormalizedProject[]; nextStart: number | null } {
  if (!isRecord(response)) return { projects: [], nextStart: null };
  const values = response.values;
  if (!Array.isArray(values)) return { projects: [], nextStart: null };
  const start = typeof response.startAt === "number" ? response.startAt : 0;
  const max = typeof response.maxResults === "number" ? response.maxResults : 50;
  const total = typeof response.total === "number" ? response.total : 0;
  const nextStart = start + max < total ? start + max : null;
  return {
    projects: values.filter(isRecord).map(normalizeProject),
    nextStart,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
