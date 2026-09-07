import { parseVisitorWebhook } from "./objects";
import type { NormalizedVisitor } from "./objects";
import { isRecord } from "./http";

// ---------------------------------------------------------------------------
// webhook.visitor_identified
// ---------------------------------------------------------------------------

export type VisitorIdentifiedSyncInput = { response: unknown };
export type VisitorIdentifiedSyncResult = {
  provider: "rb2b";
  operation: "webhook.visitor_identified";
  items: NormalizedVisitor[];
  count: number;
};

export function executeVisitorIdentifiedSync(input: VisitorIdentifiedSyncInput): VisitorIdentifiedSyncResult {
  const payload = input.response;
  if (!isRecord(payload)) {
    return { provider: "rb2b", operation: "webhook.visitor_identified", items: [], count: 0 };
  }
  const visitor = parseVisitorWebhook(payload);
  return {
    provider: "rb2b",
    operation: "webhook.visitor_identified",
    items: [visitor],
    count: 1,
  };
}
