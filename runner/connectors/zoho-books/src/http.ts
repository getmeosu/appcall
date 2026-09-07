import { createConnectorHttpClient } from "../../../bun/src/http";

export function createZohoBooksClient({ accessToken, organizationId }: { accessToken: string; organizationId: string }) {
  const client = createConnectorHttpClient({
    allowedHosts: ["books.zoho.com"],
    maxResponseBytes: 5242880,
    fetch: globalThis.fetch,
  });

  const baseUrl = "https://books.zoho.com/api/v3";

  return {
    get<T = unknown>(path: string, params?: Record<string, string>): Promise<{ data: T | null; error: string | null }> {
      const url = new URL(path, baseUrl);
      if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      url.searchParams.set("organization_id", organizationId);
      return client.get(url.toString(), {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
    },
  };
}
