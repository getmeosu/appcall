import { extractActions, type HoldReason, type StaticProvider } from "./static-parser";
export type ExtractResult = { providers: StaticProvider[]; holds: HoldReason[] };
export function extractProvider(providerId: string, definition: string, actions: string, paths = { definition: "definition.ts", actions: "actions.ts" }, requested?: readonly string[]): ExtractResult {
  if (!/export\s+const\s+provider\s*:/m.test(definition)) return { providers: [], holds: [{ providerId, code: "DYNAMIC_DEFINITION", detail: "provider definition is not a static provider export" }] };
  const displayName = definition.match(/displayName\s*:\s*["']([^"']+)["']/)?.[1] ?? providerId;
  const parsed = extractActions(actions, paths.actions, providerId, requested);
  return { providers: [{ id: providerId, displayName, actions: parsed.actions }], holds: parsed.holds };
}
