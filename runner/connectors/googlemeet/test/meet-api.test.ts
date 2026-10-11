import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  createSpace,
  endActiveConference,
  getConferenceRecord,
  getParticipantSession,
  getSpace,
  getTranscript,
  getTranscriptEntry,
  listConferenceRecords,
  listParticipantSessions,
  listParticipants,
  listRecordings,
  listRecordingsByConference,
  listTranscriptEntries,
  listTranscriptsByConference,
  meetHandlers,
  updateSpace,
} from "../src/meet-api";

const TOKEN = "ya29.test";

function capture() {
  const requests: Request[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return Response.json({ name: "ok" }, { status: 200 });
  };
  return { requests, fetchImpl };
}

describe("google meet api handlers", () => {
  test("manifest operations for every Meet REST tool are backed by a handler", () => {
    for (const key of Object.keys(meetHandlers)) {
      expect(manifest.operations[key as keyof typeof manifest.operations], key).toBeDefined();
      const operation = manifest.operations[key as keyof typeof manifest.operations] as {
        request?: { method?: string; path?: string };
        inputSchema?: { type?: string };
        title?: string;
        description?: string;
      };
      expect(operation.title?.length).toBeGreaterThan(0);
      expect(operation.description?.length).toBeGreaterThan(0);
      expect(operation.inputSchema?.type).toBe("object");
      expect(typeof operation.request?.method).toBe("string");
      expect(operation.request?.path?.startsWith("/")).toBe(true);
    }
    expect(Object.keys(meetHandlers)).toHaveLength(15);
  });

  test("creates a space with config and no calendar attachment", async () => {
    const { requests, fetchImpl } = capture();
    const result = await createSpace({
      accessToken: TOKEN,
      config: { accessType: "TRUSTED" },
      fetch: fetchImpl,
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://meet.googleapis.com/v2/spaces");
    expect(requests[0].headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(requests[0].headers.get("content-type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({ config: { accessType: "TRUSTED" } });
    expect(result).toMatchObject({ connector: "googlemeet", action: "spaces.create", source: "provider" });
  });

  test("ends the active conference on a space resource", async () => {
    const { requests, fetchImpl } = capture();
    await endActiveConference({ accessToken: TOKEN, space_name: "spaces/jQCFfuBOdN5z", fetch: fetchImpl });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://meet.googleapis.com/v2/spaces/jQCFfuBOdN5z:endActiveConference");
    expect(requests[0].headers.get("content-type")).toBeNull();
  });

  test("gets, patches, and lists Meet resources", async () => {
    const { requests, fetchImpl } = capture();
    await getSpace({ accessToken: TOKEN, space_name: "abc", fetch: fetchImpl });
    await updateSpace({
      accessToken: TOKEN,
      name: "spaces/abc",
      updateMask: "config.accessType",
      config: { accessType: "OPEN" },
      fetch: fetchImpl,
    });
    await getConferenceRecord({ accessToken: TOKEN, name: "conferenceRecords/rec-1", fetch: fetchImpl });
    await listConferenceRecords({ accessToken: TOKEN, page_size: 10, filter: "space.name = \"spaces/abc\"", fetch: fetchImpl });
    await listParticipants({ accessToken: TOKEN, parent: "conferenceRecords/rec-1", page_token: "next", fetch: fetchImpl });
    await getParticipantSession({
      accessToken: TOKEN,
      name: "conferenceRecords/rec-1/participants/p-1/participantSessions/s-1",
      fetch: fetchImpl,
    });
    await listParticipantSessions({
      accessToken: TOKEN,
      conference_record_id: "rec-1",
      participant_id: "p-1",
      fetch: fetchImpl,
    });
    await listRecordings({ accessToken: TOKEN, parent: "conferenceRecords/rec-1", fetch: fetchImpl });
    await listRecordingsByConference({ accessToken: TOKEN, conference_record_id: "rec-1", fetch: fetchImpl });
    await getTranscript({ accessToken: TOKEN, name: "conferenceRecords/rec-1/transcripts/t-1", fetch: fetchImpl });
    await listTranscriptsByConference({ accessToken: TOKEN, conference_record_id: "rec-1", page_size: 5, fetch: fetchImpl });
    await getTranscriptEntry({
      accessToken: TOKEN,
      name: "conferenceRecords/rec-1/transcripts/t-1/entries/e-1",
      fetch: fetchImpl,
    });
    await listTranscriptEntries({
      accessToken: TOKEN,
      conference_record_id: "rec-1",
      transcript_id: "t-1",
      fetch: fetchImpl,
    });

    const urls = requests.map((request) => `${request.method} ${request.url}`);
    expect(urls).toEqual([
      "GET https://meet.googleapis.com/v2/spaces/abc",
      "PATCH https://meet.googleapis.com/v2/spaces/abc?updateMask=config.accessType",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1",
      "GET https://meet.googleapis.com/v2/conferenceRecords?pageSize=10&filter=space.name+%3D+%22spaces%2Fabc%22",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/participants?pageToken=next",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/participants/p-1/participantSessions/s-1",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/participants/p-1/participantSessions",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/recordings",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/recordings",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/transcripts/t-1",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/transcripts?pageSize=5",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/transcripts/t-1/entries/e-1",
      "GET https://meet.googleapis.com/v2/conferenceRecords/rec-1/transcripts/t-1/entries",
    ]);
  });

  test("validates without a token and rejects a missing space", async () => {
    const validated = await getSpace({ space_name: "abc" });
    expect(validated).toMatchObject({ source: "connector", validated: { space_name: "spaces/abc" } });
    expect(() => endActiveConference({ space_name: "" })).toThrow("space_name is required");
  });

  test("maps 401 and 429", async () => {
    await expect(getSpace({
      accessToken: TOKEN,
      space_name: "abc",
      fetch: async () => new Response(JSON.stringify({ error: { message: "Invalid Credentials" } }), { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getSpace({
      accessToken: TOKEN,
      space_name: "abc",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "3" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 3 });
  });
});
