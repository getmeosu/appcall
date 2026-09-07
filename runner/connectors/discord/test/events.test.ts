import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import eventFixture from "../fixtures/event.json";
import emojisList from "../fixtures/emojis_list.json";
import { mockFetch, jsonBody as body } from "./support";

const { actions } = compileDeclarativeConnector(manifest as never);
const ops = manifest.operations as Record<string, { sideEffect: string }>;

describe("events", () => {
  it("lists events with user counts", async () => {
    const { calls, fetchFn } = mockFetch([eventFixture]);
    const result = (await actions["events.list"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/scheduled-events?with_user_count=true");
    expect(result.events).toEqual([eventFixture]);
  });

  it("creates an external event with a location and an end time", async () => {
    const { calls, fetchFn } = mockFetch(eventFixture, 200);
    await actions["events.createExternal"]!({
      botToken: "tok_TEST", guildId: "1100000000000000001", name: "Community call", description: "Monthly call",
      startsAt: "2026-09-12T17:00:00Z", endsAt: "2026-09-12T18:00:00Z", location: "https://meet.example.com/meosu", fetch: fetchFn,
    });
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/scheduled-events");
    expect(body(calls)).toEqual({
      name: "Community call", description: "Monthly call", scheduled_start_time: "2026-09-12T17:00:00Z", scheduled_end_time: "2026-09-12T18:00:00Z",
      privacy_level: 2, entity_type: 3, entity_metadata: { location: "https://meet.example.com/meosu" },
    });
  });

  it("creates a voice-channel event", async () => {
    const { calls, fetchFn } = mockFetch(eventFixture, 200);
    await actions["events.createVoice"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", name: "Office hours", startsAt: "2026-09-12T17:00:00Z", channelId: "1300000000000000003", fetch: fetchFn });
    expect(body(calls)).toEqual({ name: "Office hours", scheduled_start_time: "2026-09-12T17:00:00Z", privacy_level: 2, entity_type: 2, channel_id: "1300000000000000003" });
  });

  it("updates and deletes an event", async () => {
    const update = mockFetch(eventFixture);
    await actions["events.update"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", eventId: "1800000000000000001", status: 2, fetch: update.fetchFn });
    expect(update.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/scheduled-events/1800000000000000001");
    expect(update.calls[0]!.init?.method).toBe("PATCH");
    expect(body(update.calls)).toEqual({ status: 2 });

    const del = mockFetch("", 204);
    await actions["events.delete"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", eventId: "1800000000000000001", fetch: del.fetchFn });
    expect(del.calls[0]!.init?.method).toBe("DELETE");
    expect(ops["events.delete"]!.sideEffect).toBe("destructive");
  });
});

describe("emojis.list", () => {
  it("lists custom emojis", async () => {
    const { calls, fetchFn } = mockFetch(emojisList);
    const result = (await actions["emojis.list"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/emojis");
    expect(result.emojis).toEqual(emojisList);
  });
});
