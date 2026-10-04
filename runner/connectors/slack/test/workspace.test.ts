import { describe, expect, test } from "bun:test";
import teamInfoFixture from "../fixtures/team_info.json";
import emojiListFixture from "../fixtures/emoji_list.json";
import pinsListFixture from "../fixtures/pins_list.json";
import reactionsGetFixture from "../fixtures/reactions_get.json";
import filesInfoFixture from "../fixtures/files_info.json";
import authTestFixture from "../fixtures/auth_test.json";
import reactionsAddFixture from "../fixtures/reactions_add.json";
import reactionsRemoveFixture from "../fixtures/reactions_remove.json";
import pinsAddFixture from "../fixtures/pins_add.json";
import pinsRemoveFixture from "../fixtures/pins_remove.json";
import {
  createSlackWorkspaceClient,
  validateTeamInfoInput,
  validateEmojiListInput,
  validatePinsListInput,
  validateReactionsGetInput,
  validateFilesInfoInput,
  validateAuthTestInput,
  validateReactionsAddInput,
  validateReactionsRemoveInput,
  validatePinsAddInput,
  validatePinsRemoveInput,
} from "../src/workspace";
import {
  getTeamInfo,
  listEmoji,
  listPins,
  getReactions,
  getFileInfo,
  authTest,
  addReaction,
  removeReaction,
  addPin,
  removePin,
} from "../src/actions";

describe("workspace validators", () => {
  test("team.info and emoji.list accept empty objects", () => {
    expect(validateTeamInfoInput({})).toEqual({});
    expect(validateEmojiListInput({})).toEqual({});
    expect(validateAuthTestInput({})).toEqual({});
  });

  test("pins.list requires channel", () => {
    expect(() => validatePinsListInput({ channel: "" })).toThrow();
    expect(validatePinsListInput({ channel: "C001" })).toEqual({ channel: "C001" });
  });

  test("reactions.get requires channel and ts", () => {
    expect(() => validateReactionsGetInput({ channel: "C123", ts: "" })).toThrow();
    expect(validateReactionsGetInput({ channel: "C123", ts: "1715680861.000200" }))
      .toEqual({ channel: "C123", ts: "1715680861.000200" });
  });

  test("files.info requires file", () => {
    expect(() => validateFilesInfoInput({ file: "" })).toThrow();
    expect(validateFilesInfoInput({ file: "F001" })).toEqual({ file: "F001" });
  });

  test("reactions.add/remove require name", () => {
    expect(() => validateReactionsAddInput({ channel: "C123", ts: "1.0", name: "" })).toThrow();
    expect(validateReactionsAddInput({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" }))
      .toEqual({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" });
    expect(validateReactionsRemoveInput({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" }))
      .toEqual({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" });
  });

  test("pins.add/remove require channel and ts", () => {
    expect(validatePinsAddInput({ channel: "C123", ts: "1715680861.000200" }))
      .toEqual({ channel: "C123", ts: "1715680861.000200" });
    expect(validatePinsRemoveInput({ channel: "C123", ts: "1715680861.000200" }))
      .toEqual({ channel: "C123", ts: "1715680861.000200" });
  });
});

describe("workspace action static validation", () => {
  test("returns validated without token", () => {
    expect((getTeamInfo({}) as Record<string, unknown>).source).toBe("connector");
    expect((listEmoji({}) as Record<string, unknown>).validated).toEqual({});
    expect((listPins({ channel: "C001" }) as Record<string, unknown>).validated).toEqual({ channel: "C001" });
    expect((getReactions({ channel: "C123", ts: "1715680861.000200" }) as Record<string, unknown>).validated)
      .toEqual({ channel: "C123", ts: "1715680861.000200" });
    expect((getFileInfo({ file: "F001" }) as Record<string, unknown>).validated).toEqual({ file: "F001" });
    expect((authTest({}) as Record<string, unknown>).validated).toEqual({});
    expect((addReaction({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" }) as Record<string, unknown>).validated)
      .toEqual({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" });
    expect((removeReaction({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" }) as Record<string, unknown>).validated)
      .toEqual({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" });
    expect((addPin({ channel: "C123", ts: "1715680861.000200" }) as Record<string, unknown>).validated)
      .toEqual({ channel: "C123", ts: "1715680861.000200" });
    expect((removePin({ channel: "C123", ts: "1715680861.000200" }) as Record<string, unknown>).validated)
      .toEqual({ channel: "C123", ts: "1715680861.000200" });
  });
});

describe("team.info live (mocked fetch)", () => {
  test("GETs team.info with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(teamInfoFixture);
      },
    });
    const result = await client.teamInfo({});
    expect(requests[0].url).toContain("https://slack.com/api/team.info");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.team.id).toBe("T001");
  });

  test("maps not_authed to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "not_authed" }),
    });
    const result = await client.teamInfo({});
    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Slack rejected the team.info request.",
        providerError: "not_authed",
      },
    });
  });
});

describe("emoji.list live (mocked fetch)", () => {
  test("GETs emoji.list with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(emojiListFixture);
      },
    });
    const result = await client.emojiList({});
    expect(requests[0].url).toContain("https://slack.com/api/emoji.list");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.emoji.shipit).toBe("https://emoji.slack-edge.com/T001/shipit.png");
  });
});

describe("pins.list live (mocked fetch)", () => {
  test("GETs pins.list with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(pinsListFixture);
      },
    });
    const result = await client.pinsList({ channel: "C001" });
    expect(requests[0].url).toContain("channel=C001");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items).toHaveLength(1);
  });
});

describe("reactions.get live (mocked fetch)", () => {
  test("GETs reactions.get with timestamp mapped from ts", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(reactionsGetFixture);
      },
    });
    const result = await client.reactionsGet({ channel: "C123", ts: "1715680861.000200" });
    expect(requests[0].url).toContain("https://slack.com/api/reactions.get");
    expect(requests[0].url).toContain("channel=C123");
    expect(requests[0].url).toContain("timestamp=1715680861.000200");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.ts).toBe("1715680861.000200");
  });
});

describe("files.info live (mocked fetch)", () => {
  test("GETs files.info with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(filesInfoFixture);
      },
    });
    const result = await client.filesInfo({ file: "F001" });
    expect(requests[0].url).toContain("https://slack.com/api/files.info");
    expect(requests[0].url).toContain("file=F001");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.id).toBe("F001");
  });

  test("maps file_not_found to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "file_not_found" }),
    });
    const result = await client.filesInfo({ file: "F999" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.providerError).toBe("file_not_found");
  });
});

describe("auth.test live (mocked fetch)", () => {
  test("GETs auth.test with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(authTestFixture);
      },
    });
    const result = await client.authTest({});
    expect(requests[0].url).toContain("https://slack.com/api/auth.test");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.teamId).toBe("T001");
      expect(result.userId).toBe("U001");
    }
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), { status: 429 }),
    });
    const result = await client.authTest({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });
});

describe("reactions.add live (mocked fetch)", () => {
  test("POSTs to reactions.add with timestamp mapped from ts", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(reactionsAddFixture);
      },
    });
    const result = await client.reactionsAdd({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" });
    expect(requests[0].url).toBe("https://slack.com/api/reactions.add");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(await requests[0].json()).toEqual({ channel: "C123", timestamp: "1715680861.000200", name: "thumbsup" });
    expect(result.ok).toBe(true);
  });

  test("maps already_reacted to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "already_reacted" }),
    });
    const result = await client.reactionsAdd({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.providerError).toBe("already_reacted");
  });
});

describe("reactions.remove live (mocked fetch)", () => {
  test("POSTs to reactions.remove", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(reactionsRemoveFixture);
      },
    });
    const result = await client.reactionsRemove({ channel: "C123", ts: "1715680861.000200", name: "thumbsup" });
    expect(requests[0].url).toBe("https://slack.com/api/reactions.remove");
    expect(result.ok).toBe(true);
  });
});

describe("pins.add live (mocked fetch)", () => {
  test("POSTs to pins.add", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(pinsAddFixture);
      },
    });
    const result = await client.pinsAdd({ channel: "C123", ts: "1715680861.000200" });
    expect(requests[0].url).toBe("https://slack.com/api/pins.add");
    expect(await requests[0].json()).toEqual({ channel: "C123", timestamp: "1715680861.000200" });
    expect(result.ok).toBe(true);
  });
});

describe("pins.remove live (mocked fetch)", () => {
  test("POSTs to pins.remove", async () => {
    const requests: Request[] = [];
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(pinsRemoveFixture);
      },
    });
    const result = await client.pinsRemove({ channel: "C123", ts: "1715680861.000200" });
    expect(requests[0].url).toBe("https://slack.com/api/pins.remove");
    expect(result.ok).toBe(true);
  });

  test("maps no_pin to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackWorkspaceClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "no_pin" }),
    });
    const result = await client.pinsRemove({ channel: "C123", ts: "1715680861.000200" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.providerError).toBe("no_pin");
  });
});
