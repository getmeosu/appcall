// Shared recording buffer for the shimmed HTTP client.
//
// The extractor executes a piece action for real and captures whatever request
// it ultimately issues. Every layer of the piece's own indirection — a
// `makeRequest` helper, an `apiCall` wrapper, a client factory — bottoms out at
// `@activepieces/pieces-common`, so recording at that single boundary works
// regardless of how the action is written.

export type RecordedRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  queryParams?: Record<string, unknown>;
  body?: unknown;
  authentication?: Record<string, unknown>;
};

const recorded: RecordedRequest[] = [];

export function recordRequest(request: RecordedRequest): void {
  recorded.push(request);
}

export function takeRecorded(): RecordedRequest[] {
  return recorded.splice(0, recorded.length);
}
