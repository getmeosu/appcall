import { describe, expect, it } from "bun:test";
import {
  normalizeForm,
  parseFormsResponse,
  normalizeResponse,
  parseResponsesResponse,
} from "../src/objects";
import formsList from "../fixtures/forms_list.json";
import formsListLastPage from "../fixtures/forms_list_last_page.json";
import responsesList from "../fixtures/responses_list.json";
import responsesListLastPage from "../fixtures/responses_list_last_page.json";

describe("normalizeForm", () => {
  const raw = formsList.items[0] as any;

  it("maps all form fields", () => {
    const f = normalizeForm(raw);
    expect(f.id).toBe("tf-form:abc123");
    expect(f.provider).toBe("typeform");
    expect(f.providerFormId).toBe("abc123");
    expect(f.title).toBe("Customer Satisfaction Survey");
    expect(f.description).toBe("Annual customer feedback survey");
    expect(f.createdAt).toBe("2025-01-15T10:30:00Z");
    expect(f.lastUpdatedAt).toBe("2025-06-01T14:20:00Z");
    expect(f.numberOfResponses).toBe(0);
    expect(f.modelVersion).toBe("2026-05-17");
  });

  it("handles null description with empty default", () => {
    const raw2 = formsList.items[1] as any;
    const f = normalizeForm(raw2);
    expect(f.id).toBe("tf-form:def456");
    expect(f.title).toBe("Job Application Form");
    expect(f.description).toBe("");
  });
});

describe("parseFormsResponse", () => {
  it("parses forms and cursor", () => {
    const result = parseFormsResponse(formsList);
    expect(result.forms).toHaveLength(2);
    expect(result.nextCursor).toBe("2");
  });

  it("returns no cursor on last page", () => {
    const result = parseFormsResponse(formsListLastPage);
    expect(result.forms).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("handles null input", () => {
    const result = parseFormsResponse(null);
    expect(result.forms).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("handles array input", () => {
    const result = parseFormsResponse([1, 2]);
    expect(result.forms).toHaveLength(0);
  });
});

describe("normalizeResponse", () => {
  const raw = responsesList.items[0] as any;

  it("maps all response fields", () => {
    const r = normalizeResponse(raw);
    expect(r.id).toBe("tf-response:resp_001");
    expect(r.provider).toBe("typeform");
    expect(r.providerResponseId).toBe("resp_001");
    expect(r.formId).toBe("abc123");
    expect(r.submittedAt).toBe("2025-06-01T14:20:00Z");
    expect(r.landedAt).toBe("2025-06-01T14:15:00Z");
    expect(r.answerCount).toBe(3);
    expect(r.modelVersion).toBe("2026-05-17");
  });

  it("counts answers correctly for second response", () => {
    const raw2 = responsesList.items[1] as any;
    const r = normalizeResponse(raw2);
    expect(r.id).toBe("tf-response:resp_002");
    expect(r.answerCount).toBe(2);
  });
});

describe("parseResponsesResponse", () => {
  it("parses responses and cursor", () => {
    const result = parseResponsesResponse(responsesList);
    expect(result.responses).toHaveLength(2);
    expect(result.nextCursor).toBe("2");
  });

  it("returns no cursor on last page", () => {
    const result = parseResponsesResponse(responsesListLastPage);
    expect(result.responses).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("handles null input", () => {
    const result = parseResponsesResponse(null);
    expect(result.responses).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("handles array input", () => {
    const result = parseResponsesResponse([1, 2]);
    expect(result.responses).toHaveLength(0);
  });
});
