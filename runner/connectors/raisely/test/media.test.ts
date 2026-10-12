import { describe, expect, it } from "bun:test";
import { uploadCampaignMedia } from "../src/actions";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("raisely campaigns.media.upload", () => {
  it("POSTs multipart filename to /campaigns/{campaign}/media/{folder}", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await uploadCampaignMedia({
      apiKey: "raisely-sk-fixture",
      campaign: "run-for-a-cure",
      folder_uuid: "uploads",
      file: { name: "hero.png", contentType: "image/png", contentBase64: png },
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({ data: { url: "https://cdn.example/hero.png", urls: ["https://cdn.example/hero.png"] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.raisely.com/v3/campaigns/run-for-a-cure/media/uploads");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBeInstanceOf(FormData);
    const form = calls[0]!.init!.body as FormData;
    expect(form.get("filename")).toBeInstanceOf(Blob);
    expect(result).toEqual({
      data: { data: { url: "https://cdn.example/hero.png", urls: ["https://cdn.example/hero.png"] } },
    });
  });

  it("rejects missing bytes", async () => {
    try {
      await uploadCampaignMedia({
        apiKey: "raisely-sk-fixture",
        campaign: "run-for-a-cure",
        folder_uuid: "uploads",
        file: { name: "hero.png" },
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("INVALID_ACTION_INPUT");
    }
  });
});
