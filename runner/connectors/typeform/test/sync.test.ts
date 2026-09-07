import { describe, expect, it } from "bun:test";
import { executeFormsListSync, executeResponsesListSync } from "../src/sync";
import formsList from "../fixtures/forms_list.json";
import formsListLastPage from "../fixtures/forms_list_last_page.json";
import responsesList from "../fixtures/responses_list.json";
import responsesListLastPage from "../fixtures/responses_list_last_page.json";

describe("forms.list sync", () => {
  it("returns normalized forms with cursor", () => {
    const result = executeFormsListSync({ response: formsList });
    expect(result.provider).toBe("typeform");
    expect(result.operation).toBe("forms.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("tf-form:abc123");
    expect(result.items[0].title).toBe("Customer Satisfaction Survey");
    expect(result.nextCursor).toBe("2");
  });

  it("returns no cursor on last page", () => {
    const result = executeFormsListSync({ response: formsListLastPage });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("handles null description in second form", () => {
    const result = executeFormsListSync({ response: formsList });
    expect(result.items[1].id).toBe("tf-form:def456");
    expect(result.items[1].description).toBe("");
  });
});

describe("responses.list sync", () => {
  it("returns normalized responses with cursor", () => {
    const result = executeResponsesListSync({ response: responsesList });
    expect(result.provider).toBe("typeform");
    expect(result.operation).toBe("responses.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("tf-response:resp_001");
    expect(result.items[0].formId).toBe("abc123");
    expect(result.items[0].answerCount).toBe(3);
    expect(result.nextCursor).toBe("2");
  });

  it("returns no cursor on last page", () => {
    const result = executeResponsesListSync({ response: responsesListLastPage });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("maps answer counts correctly", () => {
    const result = executeResponsesListSync({ response: responsesList });
    expect(result.items[0].answerCount).toBe(3);
    expect(result.items[1].answerCount).toBe(2);
  });
});
