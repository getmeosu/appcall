import { describe, expect, test } from "bun:test";
import { createGoogleMeetClient } from "../src/http";

describe("createGoogleMeetClient", () => {
  test("sends Bearer auth to the calendar base URL", async () => {
    const requests: Request[] = [];
    const client = createGoogleMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ id: "evt_1" }, { status: 200 });
      },
    });
    const res = await client.fetchJSON("/calendars/primary/events", { method: "GET" });
    expect(res.status).toBe(200);
    expect(new URL(requests[0].url).hostname).toBe("www.googleapis.com");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test");
  });
});
