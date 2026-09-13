import type { DeclarativeManifest } from "../../../runner/bun/src/declarative/types";
import type { SelectionEntry } from "./selection";

export type SourceSpan = { path: string; startLine: number; endLine: number };
export type OperationSource = {
  upstreamActionId: string;
  sourceRefs: string[];
  documentationUrls: string[];
  responseContract: "preserve-existing" | "appcall-provider-json-v1";
  adaptations: string[];
};
export type ReviewedRecipe = {
  schemaVersion: 1;
  providerId: string;
  appcallId: string;
  source: { url: string; revision: string; files: Record<string, string>; spans: Record<string, SourceSpan> };
  selection: SelectionEntry;
  research: Record<string, unknown>;
  operationSources: Record<string, OperationSource>;
  manifest: DeclarativeManifest & { key: string; operations: Record<string, unknown> };
};
