import { describe, expect, test } from "bun:test";
import {
  executeInterviewsGet,
  executeInterviewStagesGet,
  executeInterviewEventsList,
  executeInterviewPlansList,
  executeInterviewStageGroupsList,
  executeFeedbackFormDefinitionsList,
  executeFeedbackFormDefinitionsGet,
  executeCustomFieldsList,
  executeCustomFieldsGet,
  executeCustomFieldsSetValue,
  executeCustomFieldsSetValues,
  executeReferralsCreate,
  executeReferralFormsGet,
  executeFilesGet,
  executeApplicationsListCriteriaEvaluations,
} from "../src/g4";
import interviewInfo from "../fixtures/interview_info.json";
import interviewStageInfo from "../fixtures/interview_stage_info.json";
import interviewEventsList from "../fixtures/interview_events_list.json";
import interviewPlansList from "../fixtures/interview_plans_list.json";
import interviewStageGroupsList from "../fixtures/interview_stage_groups_list.json";
import feedbackFormDefinitionsList from "../fixtures/feedback_form_definitions_list.json";
import feedbackFormDefinitionInfo from "../fixtures/feedback_form_definition_info.json";
import customFieldsList from "../fixtures/custom_fields_list.json";
import customFieldInfo from "../fixtures/custom_field_info.json";
import customFieldValueSet from "../fixtures/custom_field_value_set.json";
import customFieldValuesSet from "../fixtures/custom_field_values_set.json";
import referralCreated from "../fixtures/referral_created.json";
import referralFormInfo from "../fixtures/referral_form_info.json";
import fileInfo from "../fixtures/file_info.json";
import applicationCriteriaEvaluationsList from "../fixtures/application_criteria_evaluations_list.json";

function stubFetch(body: string, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey" };
const SCHEDULE = "9d34f544-c150-4d70-91c4-e8b0b4a72846";
const APP = "f9e52a51-a075-4116-a7b8-484deba69004";
const CANDIDATE = "84bfbed7-ed0a-496d-bb18-11b73369f666";
const FIELD = "650e5f74-32db-4a0a-b61b-b9afece05023";

describe("Ashby G4 interview / form lookups", () => {
  test("interviews.get POSTs /interview.info", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewInfo));
    const result = await executeInterviewsGet({
      ...auth,
      id: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/interview.info");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      id: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
    });
    expect((result.interview as { title?: string })?.title).toBe("Technical Interview");
  });

  test("interviews.get rejects missing id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeInterviewsGet({ ...auth, id: "", fetch: impl })).rejects.toThrow(/id/);
    expect(calls).toHaveLength(0);
  });

  test("interview_stages.get POSTs /interviewStage.info", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewStageInfo));
    const result = await executeInterviewStagesGet({
      ...auth,
      interviewStageId: "c153b3e9-8b97-4fc0-bad1-6c654122c1f8",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/interviewStage.info");
    expect((result.interviewStage as { title?: string })?.title).toBe("Application Review");
  });

  test("interview_events.list POSTs /interviewEvent.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewEventsList));
    const result = await executeInterviewEventsList({
      ...auth,
      interviewScheduleId: SCHEDULE,
      expand: ["interview"],
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/interviewEvent.list");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      interviewScheduleId: SCHEDULE,
      expand: ["interview"],
    });
    expect(result.interviewEvents).toHaveLength(1);
    expect(result.syncToken).toBe("sync-iev-1");
  });

  test("interview_plans.list POSTs /interviewPlan.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewPlansList));
    const result = await executeInterviewPlansList({
      ...auth,
      includeArchived: false,
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/interviewPlan.list");
    expect(result.interviewPlans).toHaveLength(2);
  });

  test("interview_stage_groups.list POSTs /interviewStageGroup.list with {}", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewStageGroupsList));
    const result = await executeInterviewStageGroupsList({ ...auth, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/interviewStageGroup.list");
    expect(JSON.parse(await calls[0]!.text())).toEqual({});
    expect(result.interviewStageGroups).toHaveLength(2);
  });

  test("feedback_form_definitions.list / get", async () => {
    const list = stubFetch(JSON.stringify(feedbackFormDefinitionsList));
    const listed = await executeFeedbackFormDefinitionsList({
      ...auth,
      includeArchived: false,
      fetch: list.impl,
    });
    expect(new URL(list.calls[0]!.url).pathname).toBe("/feedbackFormDefinition.list");
    expect(listed.feedbackFormDefinitions).toHaveLength(1);

    const get = stubFetch(JSON.stringify(feedbackFormDefinitionInfo));
    const got = await executeFeedbackFormDefinitionsGet({
      ...auth,
      feedbackFormDefinitionId: "07189c2e-cacd-489d-8946-165acacc386f",
      fetch: get.impl,
    });
    expect(new URL(get.calls[0]!.url).pathname).toBe("/feedbackFormDefinition.info");
    expect((got.feedbackFormDefinition as { title?: string })?.title).toBe("Technical Scorecard");
  });
});

describe("Ashby G4 custom fields / referrals / files / criteria", () => {
  test("custom_fields.list POSTs /customField.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(customFieldsList));
    const result = await executeCustomFieldsList({ ...auth, limit: 10, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/customField.list");
    expect(result.customFields).toHaveLength(1);
  });

  test("custom_fields.get accepts customFieldId or referenceIdentifier", async () => {
    const byId = stubFetch(JSON.stringify(customFieldInfo));
    await executeCustomFieldsGet({ ...auth, customFieldId: FIELD, fetch: byId.impl });
    expect(JSON.parse(await byId.calls[0]!.text())).toEqual({ customFieldId: FIELD });

    const byRef = stubFetch(JSON.stringify(customFieldInfo));
    const result = await executeCustomFieldsGet({
      ...auth,
      referenceIdentifier: "preferred_team",
      fetch: byRef.impl,
    });
    expect(JSON.parse(await byRef.calls[0]!.text())).toEqual({
      referenceIdentifier: "preferred_team",
    });
    expect((result.customField as { title?: string })?.title).toBe("Preferred Team");
  });

  test("custom_fields.get rejects when neither id nor reference provided", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeCustomFieldsGet({ ...auth, fetch: impl })).rejects.toThrow(
      /customFieldId or referenceIdentifier/,
    );
    expect(calls).toHaveLength(0);
  });

  test("custom_fields.set_value POSTs /customField.setValue and preserves null", async () => {
    const set = stubFetch(JSON.stringify(customFieldValueSet));
    const result = await executeCustomFieldsSetValue({
      ...auth,
      objectId: CANDIDATE,
      objectType: "Candidate",
      fieldId: FIELD,
      fieldValue: "Backend",
      fetch: set.impl,
    });
    expect(new URL(set.calls[0]!.url).pathname).toBe("/customField.setValue");
    expect(JSON.parse(await set.calls[0]!.text())).toEqual({
      objectId: CANDIDATE,
      objectType: "Candidate",
      fieldId: FIELD,
      fieldValue: "Backend",
    });
    expect(result.value).toBe("Backend");

    const clear = stubFetch(JSON.stringify(customFieldValueSet));
    await executeCustomFieldsSetValue({
      ...auth,
      objectId: CANDIDATE,
      objectType: "Candidate",
      fieldId: FIELD,
      fieldValue: null,
      fetch: clear.impl,
    });
    expect(JSON.parse(await clear.calls[0]!.text())).toEqual({
      objectId: CANDIDATE,
      objectType: "Candidate",
      fieldId: FIELD,
      fieldValue: null,
    });
  });

  test("custom_fields.set_value rejects unknown objectType before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeCustomFieldsSetValue({
        ...auth,
        objectId: CANDIDATE,
        objectType: "Employee" as unknown as "Candidate",
        fieldId: FIELD,
        fieldValue: "x",
        fetch: impl,
      }),
    ).rejects.toThrow(/objectType/);
    expect(calls).toHaveLength(0);
  });

  test("custom_fields.set_values POSTs /customField.setValues", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(customFieldValuesSet));
    const values = [
      { fieldId: FIELD, fieldValue: "Backend" },
      { fieldId: "650e5f74-32db-4a0a-b61b-b9afece05024", fieldValue: 5 },
    ];
    const result = await executeCustomFieldsSetValues({
      ...auth,
      objectId: CANDIDATE,
      objectType: "Candidate",
      values,
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/customField.setValues");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      objectId: CANDIDATE,
      objectType: "Candidate",
      values,
    });
    expect(result.values).toHaveLength(2);
  });

  test("referrals.create POSTs /referral.create with no effect keys (create omits)", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(referralCreated));
    const result = await executeReferralsCreate({
      ...auth,
      id: "rform-1111-2222-3333-444455556666",
      creditedToUserId: "7211e226-7802-41fd-8d55-2720fe9d534f",
      fieldSubmissions: [
        { path: "_systemfield_email", value: "michael@bluth.example" },
        { path: "_systemfield_name", value: "Michael Bluth" },
      ],
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/referral.create");
    expect(result.id).toBe("e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(result.status).toBe("Active");
  });

  test("referral_forms.get POSTs /referralForm.info with {}", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(referralFormInfo));
    const result = await executeReferralFormsGet({ ...auth, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/referralForm.info");
    expect(JSON.parse(await calls[0]!.text())).toEqual({});
    expect((result.referralForm as { id?: string })?.id).toBe(
      "rform-1111-2222-3333-444455556666",
    );
  });

  test("files.get POSTs /file.info", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(fileInfo));
    const result = await executeFilesGet({
      ...auth,
      fileHandle: "eyJoYW5kbGUiOnsidHlwZSI6IkNhbmRpZGF0ZUZpbGUiLCJm",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/file.info");
    expect((result.file as { url?: string })?.url).toContain("cdn.ashbyhq.com");
  });

  test("applications.list_criteria_evaluations POSTs applicationId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationCriteriaEvaluationsList));
    const result = await executeApplicationsListCriteriaEvaluations({
      ...auth,
      applicationId: APP,
      limit: 10,
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/application.listCriteriaEvaluations");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ applicationId: APP, limit: 10 });
    expect(result.criteriaEvaluations).toHaveLength(1);
    expect((result.criteriaEvaluations[0] as { outcome?: string }).outcome).toBe("Meets");
  });

  test("G4 writes surface upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 422 });
    await expect(
      executeCustomFieldsSetValue({
        ...auth,
        objectId: CANDIDATE,
        objectType: "Candidate",
        fieldId: FIELD,
        fieldValue: "x",
        fetch: impl,
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
