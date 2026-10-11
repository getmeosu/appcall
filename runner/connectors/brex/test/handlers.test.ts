import { describe, expect, it } from "bun:test";
import { updateCardStatus } from "../src/actions";

describe("brex handwritten card status", () => {
  it("unlocks with POST /unlock", async () => {
    const calls: string[] = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      return new Response(JSON.stringify({ id: "ncard_1", status: "ACTIVE" }), { status: 200 });
    };
    const result = await updateCardStatus({
      apiKey: "bxt_fixture",
      card_id: "ncard_1",
      status: "ACTIVE",
      fetch: fetchFn,
    });
    expect(calls).toEqual(["POST https://api.brex.com/v2/cards/ncard_1/unlock"]);
    expect(result).toEqual({ connector: "brex", action: "cards.update_status", source: "provider", data: { id: "ncard_1", status: "ACTIVE" } });
  });

  it("terminates with POST /terminate", async () => {
    const calls: string[] = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      return new Response(JSON.stringify({ id: "ncard_1", status: "TERMINATED" }), { status: 200 });
    };
    await updateCardStatus({ apiKey: "bxt_fixture", card_id: "ncard_1", status: "TERMINATED", fetch: fetchFn });
    expect(calls).toEqual(["POST https://api.brex.com/v2/cards/ncard_1/terminate"]);
  });
});
