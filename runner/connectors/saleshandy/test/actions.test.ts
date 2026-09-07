import { describe, expect, test } from "bun:test";
import sequencesListFixture from "../fixtures/sequences_list.json";
import sequenceGetFixture from "../fixtures/sequence_get.json";
import sequenceCreateFixture from "../fixtures/sequence_create.json";
import sequencePauseFixture from "../fixtures/sequence_pause.json";
import sequenceResumeFixture from "../fixtures/sequence_resume.json";
import sequenceStepsListFixture from "../fixtures/sequence_steps_list.json";
import prospectsAddToSequenceFixture from "../fixtures/prospects_add_to_sequence.json";
import prospectsListFixture from "../fixtures/prospects_list.json";
import prospectGetFixture from "../fixtures/prospect_get.json";
import prospectUpdateFixture from "../fixtures/prospect_update.json";
import prospectPauseFixture from "../fixtures/prospect_pause.json";
import prospectResumeFixture from "../fixtures/prospect_resume.json";
import prospectUnsubscribeFixture from "../fixtures/prospect_unsubscribe.json";
import emailAccountsListFixture from "../fixtures/email_accounts_list.json";

import {
  listSequences,
  getSequence,
  createSequence,
  pauseSequence,
  resumeSequence,
  listSequenceSteps,
  addProspectsToSequence,
  listProspects,
  getProspect,
  updateProspect,
  pauseProspect,
  resumeProspect,
  unsubscribeProspect,
  listEmailAccounts,
  validateSequencesListInput,
  validateSequencesGetInput,
  validateSequencesCreateInput,
  validateSequencesPauseInput,
  validateSequencesResumeInput,
  validateSequenceStepsListInput,
  validateProspectsAddToSequenceInput,
  validateProspectsListInput,
  validateProspectsGetInput,
  validateProspectsUpdateInput,
  validateProspectsPauseInput,
  validateProspectsResumeInput,
  validateProspectsUnsubscribeInput,
  validateEmailAccountsListInput,
} from "../src/actions";

// ─── sequences.list ──────────────────────────────────────────────────────────

describe("listSequences", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = listSequences({ page: 1, limit: 10 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sequences.list");
    expect(result.connector).toBe("saleshandy");
    expect((result.validated as { page: number }).page).toBe(1);
  });

  test("calls GET /v1/sequences with x-api-key header and pageSize param", async () => {
    const requests: Request[] = [];
    const result = await listSequences({
      apiKey: "test_key",
      page: 1,
      limit: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sequencesListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v1/sequences");
    expect(url.searchParams.get("page")).toBe("1");
    // 'limit' is mapped to 'pageSize' (real API param)
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(requests[0].headers.get("x-api-key")).toBe("test_key");
    expect(result.connector).toBe("saleshandy");
    expect(result.action).toBe("sequences.list");
    expect(result.source).toBe("connector");
    expect(Array.isArray(result.sequences)).toBe(true);
    expect((result.sequences as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listSequences({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps non-200 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listSequences({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── sequences.get ───────────────────────────────────────────────────────────

describe("getSequence", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = getSequence({ sequenceId: "seq_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sequences.get");
    expect((result.validated as { sequenceId: string }).sequenceId).toBe("seq_001");
  });

  test("throws when sequenceId is missing", () => {
    expect(() => validateSequencesGetInput({})).toThrow("sequenceId is required");
  });

  test("calls GET /v1/sequences/{id} with x-api-key header", async () => {
    const requests: Request[] = [];
    const result = await getSequence({
      apiKey: "test_key",
      sequenceId: "seq_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sequenceGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/sequences/seq_001");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("x-api-key")).toBe("test_key");
    expect(result.action).toBe("sequences.get");
    expect(result.sequence).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getSequence({
      apiKey: "test_key",
      sequenceId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getSequence({
      apiKey: "test_key",
      sequenceId: "seq_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

// ─── sequences.create ────────────────────────────────────────────────────────

describe("createSequence", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = createSequence({ name: "New Campaign" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sequences.create");
    expect((result.validated as { name: string }).name).toBe("New Campaign");
  });

  test("throws when name is missing", () => {
    expect(() => validateSequencesCreateInput({})).toThrow("name is required");
  });

  test("calls POST /v1/sequences with x-api-key header and body", async () => {
    const requests: Request[] = [];
    const result = await createSequence({
      apiKey: "test_key",
      name: "New Campaign",
      emailAccountId: "ea_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sequenceCreateFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/sequences");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("x-api-key")).toBe("test_key");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.name).toBe("New Campaign");
    expect(body.emailAccountId).toBe("ea_001");
    expect(result.action).toBe("sequences.create");
    expect(result.sequence).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createSequence({
      apiKey: "test_key",
      name: "Test",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── sequences.pause ─────────────────────────────────────────────────────────

describe("pauseSequence", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = pauseSequence({ sequenceId: "seq_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sequences.pause");
    expect((result.validated as { sequenceId: string }).sequenceId).toBe("seq_001");
  });

  test("throws when sequenceId is missing", () => {
    expect(() => validateSequencesPauseInput({})).toThrow("sequenceId is required");
  });

  test("calls POST /v1/sequences/{id}/pause with x-api-key header", async () => {
    const requests: Request[] = [];
    const result = await pauseSequence({
      apiKey: "test_key",
      sequenceId: "seq_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sequencePauseFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/sequences/seq_001/pause");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("x-api-key")).toBe("test_key");
    expect(result.action).toBe("sequences.pause");
    expect(result.result).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(pauseSequence({
      apiKey: "test_key",
      sequenceId: "seq_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── sequences.resume ────────────────────────────────────────────────────────

describe("resumeSequence", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = resumeSequence({ sequenceId: "seq_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sequences.resume");
    expect((result.validated as { sequenceId: string }).sequenceId).toBe("seq_001");
  });

  test("throws when sequenceId is missing", () => {
    expect(() => validateSequencesResumeInput({})).toThrow("sequenceId is required");
  });

  test("calls POST /v1/sequences/{id}/resume", async () => {
    const requests: Request[] = [];
    const result = await resumeSequence({
      apiKey: "test_key",
      sequenceId: "seq_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sequenceResumeFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/sequences/seq_001/resume");
    expect(requests[0].method).toBe("POST");
    expect(result.action).toBe("sequences.resume");
    expect(result.result).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(resumeSequence({
      apiKey: "test_key",
      sequenceId: "seq_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── sequence.steps.list ─────────────────────────────────────────────────────

describe("listSequenceSteps", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = listSequenceSteps({ sequenceId: "seq_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sequence.steps.list");
    expect((result.validated as { sequenceId: string }).sequenceId).toBe("seq_001");
  });

  test("throws when sequenceId is missing", () => {
    expect(() => validateSequenceStepsListInput({})).toThrow("sequenceId is required");
  });

  test("calls GET /v1/sequences/{id}/steps", async () => {
    const requests: Request[] = [];
    const result = await listSequenceSteps({
      apiKey: "test_key",
      sequenceId: "seq_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sequenceStepsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/sequences/seq_001/steps");
    expect(requests[0].method).toBe("GET");
    expect(result.action).toBe("sequence.steps.list");
    expect(Array.isArray(result.steps)).toBe(true);
    expect((result.steps as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listSequenceSteps({
      apiKey: "test_key",
      sequenceId: "seq_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "25" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 25 });
  });
});

// ─── prospects.add_to_sequence ───────────────────────────────────────────────
// Real API: POST /v1/prospects/import-with-field-name
// Input uses 'stepId' (sequence step ID) instead of 'sequenceId'.
// The 'sequenceId' field is accepted as a fallback alias for 'stepId'.

describe("addProspectsToSequence", () => {
  test("validates input with stepId and returns connector-owned output (no apiKey)", () => {
    const result = addProspectsToSequence({
      stepId: "step_001",
      prospects: [{ email: "alice@example.com", firstName: "Alice" }],
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospects.add_to_sequence");
    const validated = result.validated as { stepId: string; prospects: { email: string }[] };
    expect(validated.stepId).toBe("step_001");
    expect(validated.prospects[0].email).toBe("alice@example.com");
  });

  test("accepts sequenceId as alias for stepId (no apiKey)", () => {
    const result = addProspectsToSequence({
      sequenceId: "seq_001",
      prospects: [{ email: "alice@example.com" }],
    });
    const validated = result.validated as { stepId: string };
    expect(validated.stepId).toBe("seq_001");
  });

  test("throws when stepId (or sequenceId) is missing", () => {
    expect(() => validateProspectsAddToSequenceInput({ prospects: [{ email: "a@b.com" }] })).toThrow("stepId is required");
  });

  test("throws when prospects array is empty", () => {
    expect(() => validateProspectsAddToSequenceInput({ stepId: "step_001", prospects: [] })).toThrow("prospects is required");
  });

  test("throws when prospect email is missing", () => {
    expect(() => validateProspectsAddToSequenceInput({ stepId: "step_001", prospects: [{ firstName: "Alice" }] })).toThrow("email is required");
  });

  test("calls POST /v1/prospects/import-with-field-name with x-api-key header", async () => {
    const requests: Request[] = [];
    const result = await addProspectsToSequence({
      apiKey: "test_key",
      stepId: "step_001",
      prospects: [
        { email: "alice@acme.com", firstName: "Alice", lastName: "Smith", company: "Acme" },
        { email: "bob@globex.com", firstName: "Bob" },
      ],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectsAddToSequenceFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/prospects/import-with-field-name");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("x-api-key")).toBe("test_key");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(Array.isArray(body.prospectList)).toBe(true);
    expect((body.prospectList as unknown[]).length).toBe(2);
    expect(body.stepId).toBe("step_001");
    expect(result.action).toBe("prospects.add_to_sequence");
    expect(result.result).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(addProspectsToSequence({
      apiKey: "test_key",
      stepId: "step_001",
      prospects: [{ email: "test@test.com" }],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "40" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 40 });
  });
});

// ─── prospects.list ──────────────────────────────────────────────────────────

describe("listProspects", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = listProspects({ page: 1, limit: 10 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospects.list");
    const validated = result.validated as { page: number; pageSize: number };
    expect(validated.page).toBe(1);
    expect(validated.pageSize).toBe(10);
  });

  test("calls GET /v1/prospects with pageSize param", async () => {
    const requests: Request[] = [];
    const result = await listProspects({
      apiKey: "test_key",
      page: 1,
      limit: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v1/prospects");
    expect(url.searchParams.get("page")).toBe("1");
    // 'limit' is mapped to 'pageSize' (real API param)
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(result.action).toBe("prospects.list");
    expect(Array.isArray(result.prospects)).toBe(true);
    expect((result.prospects as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listProspects({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listProspects({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── prospects.get ───────────────────────────────────────────────────────────

describe("getProspect", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = getProspect({ prospectId: "pro_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospects.get");
    expect((result.validated as { prospectId: string }).prospectId).toBe("pro_001");
  });

  test("throws when prospectId is missing", () => {
    expect(() => validateProspectsGetInput({})).toThrow("prospectId is required");
  });

  test("calls GET /v1/prospects/{id}", async () => {
    const requests: Request[] = [];
    const result = await getProspect({
      apiKey: "test_key",
      prospectId: "pro_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/prospects/pro_001");
    expect(requests[0].method).toBe("GET");
    expect(result.action).toBe("prospects.get");
    expect(result.prospect).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getProspect({
      apiKey: "test_key",
      prospectId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getProspect({
      apiKey: "test_key",
      prospectId: "pro_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

// ─── prospects.update ────────────────────────────────────────────────────────
// Real API: POST /v1/prospects/{id}/attribute

describe("updateProspect", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = updateProspect({ prospectId: "pro_001", firstName: "Alice", lastName: "Johnson" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospects.update");
    const validated = result.validated as { prospectId: string; firstName: string };
    expect(validated.prospectId).toBe("pro_001");
    expect(validated.firstName).toBe("Alice");
  });

  test("throws when prospectId is missing", () => {
    expect(() => validateProspectsUpdateInput({})).toThrow("prospectId is required");
  });

  test("calls POST /v1/prospects/{id}/attribute with x-api-key header", async () => {
    const requests: Request[] = [];
    const result = await updateProspect({
      apiKey: "test_key",
      prospectId: "pro_001",
      firstName: "Alice",
      lastName: "Johnson",
      title: "CTO",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectUpdateFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/prospects/pro_001/attribute");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.firstName).toBe("Alice");
    expect(body.lastName).toBe("Johnson");
    expect(body.title).toBe("CTO");
    expect(result.action).toBe("prospects.update");
    expect(result.prospect).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(updateProspect({
      apiKey: "test_key",
      prospectId: "pro_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── prospects.pause ─────────────────────────────────────────────────────────
// Real API: PATCH /v1/prospects/status  { prospectAndSequenceIds: [...], status: "paused" }

describe("pauseProspect", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = pauseProspect({ sequenceId: "seq_001", prospectId: "pro_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospects.pause");
    const validated = result.validated as { sequenceId: string; prospectId: string };
    expect(validated.sequenceId).toBe("seq_001");
    expect(validated.prospectId).toBe("pro_001");
  });

  test("throws when sequenceId is missing", () => {
    expect(() => validateProspectsPauseInput({ prospectId: "pro_001" })).toThrow("sequenceId is required");
  });

  test("throws when prospectId is missing", () => {
    expect(() => validateProspectsPauseInput({ sequenceId: "seq_001" })).toThrow("prospectId is required");
  });

  test("calls PATCH /v1/prospects/status with status=paused", async () => {
    const requests: Request[] = [];
    const result = await pauseProspect({
      apiKey: "test_key",
      sequenceId: "seq_001",
      prospectId: "pro_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectPauseFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/prospects/status");
    expect(requests[0].method).toBe("PATCH");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.status).toBe("paused");
    expect(Array.isArray(body.prospectAndSequenceIds)).toBe(true);
    expect(result.action).toBe("prospects.pause");
    expect(result.result).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(pauseProspect({
      apiKey: "test_key",
      sequenceId: "seq_001",
      prospectId: "pro_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

// ─── prospects.resume ────────────────────────────────────────────────────────
// Real API: PATCH /v1/prospects/status  { prospectAndSequenceIds: [...], status: "active" }

describe("resumeProspect", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = resumeProspect({ sequenceId: "seq_001", prospectId: "pro_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospects.resume");
  });

  test("throws when sequenceId is missing", () => {
    expect(() => validateProspectsResumeInput({ prospectId: "pro_001" })).toThrow("sequenceId is required");
  });

  test("calls PATCH /v1/prospects/status with status=active", async () => {
    const requests: Request[] = [];
    const result = await resumeProspect({
      apiKey: "test_key",
      sequenceId: "seq_001",
      prospectId: "pro_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectResumeFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/prospects/status");
    expect(requests[0].method).toBe("PATCH");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.status).toBe("active");
    expect(Array.isArray(body.prospectAndSequenceIds)).toBe(true);
    expect(result.action).toBe("prospects.resume");
    expect(result.result).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(resumeProspect({
      apiKey: "test_key",
      sequenceId: "seq_001",
      prospectId: "pro_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── prospects.unsubscribe ───────────────────────────────────────────────────
// Real API: PATCH /v1/prospects/status  { prospectAndSequenceIds: [...], status: "unsubscribed" }

describe("unsubscribeProspect", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = unsubscribeProspect({ prospectId: "pro_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("prospects.unsubscribe");
    expect((result.validated as { prospectId: string }).prospectId).toBe("pro_001");
  });

  test("throws when prospectId is missing", () => {
    expect(() => validateProspectsUnsubscribeInput({})).toThrow("prospectId is required");
  });

  test("calls PATCH /v1/prospects/status with status=unsubscribed", async () => {
    const requests: Request[] = [];
    const result = await unsubscribeProspect({
      apiKey: "test_key",
      prospectId: "pro_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(prospectUnsubscribeFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://open-api.saleshandy.com/v1/prospects/status");
    expect(requests[0].method).toBe("PATCH");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.status).toBe("unsubscribed");
    expect(Array.isArray(body.prospectAndSequenceIds)).toBe(true);
    expect(result.action).toBe("prospects.unsubscribe");
    expect(result.result).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(unsubscribeProspect({
      apiKey: "test_key",
      prospectId: "pro_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(unsubscribeProspect({
      apiKey: "test_key",
      prospectId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── email_accounts.list ─────────────────────────────────────────────────────
// Real API: POST /v1/email-accounts (POST with filter body, not GET)

describe("listEmailAccounts", () => {
  test("validates input and returns connector-owned output (no apiKey)", () => {
    const result = listEmailAccounts({ page: 1, limit: 20 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("email_accounts.list");
    expect((result.validated as { page: number }).page).toBe(1);
  });

  test("calls POST /v1/email-accounts with x-api-key header and body params", async () => {
    const requests: Request[] = [];
    const result = await listEmailAccounts({
      apiKey: "test_key",
      page: 1,
      limit: 20,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(emailAccountsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v1/email-accounts");
    // Real API uses POST with body, not GET with query params
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(requests[0].headers.get("x-api-key")).toBe("test_key");
    expect(result.action).toBe("email_accounts.list");
    expect(Array.isArray(result.emailAccounts)).toBe(true);
    expect((result.emailAccounts as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listEmailAccounts({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listEmailAccounts({
      apiKey: "test_key",
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
