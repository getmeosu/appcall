export type Call = { url: string; init?: RequestInit };

// A fetch that records every call and answers with one canned body. An empty
// string body models Discord's 204 responses.
export function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(payload, { status, headers: { "Content-Type": "application/json", ...headers } });
  };
  return { calls, fetchFn };
}

export const authHeader = (calls: Call[]) => (calls[0]!.init?.headers as Record<string, string>).Authorization;
export const jsonBody = (calls: Call[]) => JSON.parse(String(calls[0]!.init?.body));
export const auditReason = (calls: Call[]) => (calls[0]!.init?.headers as Record<string, string>)["X-Audit-Log-Reason"];
