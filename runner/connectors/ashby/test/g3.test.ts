import { describe, expect, test } from "bun:test";
import {
  executeOpeningsSetArchived,
  executeOpeningsSetState,
  executeOpeningsAddJob,
  executeOpeningsRemoveJob,
  executeOpeningsAddLocation,
  executeOpeningsRemoveLocation,
  executeLocationsList,
  executeLocationsGet,
  executeDepartmentsGet,
  executeUsersSearch,
  executeOffersCreate,
  executeOffersStart,
  executeOfferProcessesStart,
  executeCommunicationTemplatesList,
  executeApplicationHiringTeamRolesList,
} from "../src/g3";
import { executeOpeningsGet } from "../src/g2";
import openingArchived from "../fixtures/opening_archived.json";
import openingStateSet from "../fixtures/opening_state_set.json";
import openingJobAdded from "../fixtures/opening_job_added.json";
import openingJobRemoved from "../fixtures/opening_job_removed.json";
import openingLocationAdded from "../fixtures/opening_location_added.json";
import openingLocationRemoved from "../fixtures/opening_location_removed.json";
import locationsList from "../fixtures/locations_list.json";
import locationInfo from "../fixtures/location_info.json";
import departmentInfo from "../fixtures/department_info.json";
import usersSearch from "../fixtures/users_search.json";
import offerCreated from "../fixtures/offer_created.json";
import offerStarted from "../fixtures/offer_started.json";
import offerProcessStarted from "../fixtures/offer_process_started.json";
import communicationTemplatesList from "../fixtures/communication_templates_list.json";
import applicationHiringTeamRolesList from "../fixtures/application_hiring_team_roles_list.json";

function stubFetch(body: string, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey" };
const OPENING = "5e6f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b";
const JOB = "4071538b-3cac-4fbf-ac76-f78ed250ffdd";
const LOCATION = "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";

describe("Ashby G3 opening writes (Reconcile → openings.get)", () => {
  test("openings.set_archived POSTs /opening.setArchived and returns null for Reconcile", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingArchived));
    const result = await executeOpeningsSetArchived({
      ...auth,
      openingId: OPENING,
      archive: true,
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(new URL(calls[0]!.url).pathname).toBe("/opening.setArchived");
    expect(calls[0]!.headers.get("authorization")).toBe("Basic Zml4dHVyZWtleTo=");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ openingId: OPENING, archive: true });
    expect(result.opening).toBeNull();
  });

  test("openings.set_archived sends archive:false to unarchive", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingArchived));
    await executeOpeningsSetArchived({ ...auth, openingId: OPENING, archive: false, fetch: impl });
    expect(JSON.parse(await calls[0]!.text())).toEqual({ openingId: OPENING, archive: false });
  });

  test("openings.set_archived rejects missing archive before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeOpeningsSetArchived({
        ...auth,
        openingId: OPENING,
        archive: undefined as unknown as boolean,
        fetch: impl,
      }),
    ).rejects.toThrow(/archive/);
    expect(calls).toHaveLength(0);
  });

  test("openings.set_state POSTs /opening.setOpeningState with closeReasonId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(openingStateSet));
    const result = await executeOpeningsSetState({
      ...auth,
      openingId: OPENING,
      openingState: "Closed",
      closeReasonId: "3a4b5c6d-7e8f-4a9b-8c0d-1e2f3a4b5c6d",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/opening.setOpeningState");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      openingId: OPENING,
      openingState: "Closed",
      closeReasonId: "3a4b5c6d-7e8f-4a9b-8c0d-1e2f3a4b5c6d",
    });
    expect(result.opening).toBeNull();
  });

  test("openings.set_state rejects states outside the documented enum", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeOpeningsSetState({
        ...auth,
        openingId: OPENING,
        openingState: "Filled" as unknown as "Open",
        fetch: impl,
      }),
    ).rejects.toThrow(/openingState/);
    expect(calls).toHaveLength(0);
  });

  test("openings.add_job / remove_job POST openingId + jobId", async () => {
    const add = stubFetch(JSON.stringify(openingJobAdded));
    expect(
      (await executeOpeningsAddJob({ ...auth, openingId: OPENING, jobId: JOB, fetch: add.impl }))
        .opening,
    ).toBeNull();
    expect(new URL(add.calls[0]!.url).pathname).toBe("/opening.addJob");
    expect(JSON.parse(await add.calls[0]!.text())).toEqual({ openingId: OPENING, jobId: JOB });

    const remove = stubFetch(JSON.stringify(openingJobRemoved));
    await executeOpeningsRemoveJob({ ...auth, openingId: OPENING, jobId: JOB, fetch: remove.impl });
    expect(new URL(remove.calls[0]!.url).pathname).toBe("/opening.removeJob");
    expect(JSON.parse(await remove.calls[0]!.text())).toEqual({ openingId: OPENING, jobId: JOB });
  });

  test("openings.add_job rejects missing jobId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeOpeningsAddJob({ ...auth, openingId: OPENING, jobId: "", fetch: impl }),
    ).rejects.toThrow(/jobId/);
    expect(calls).toHaveLength(0);
  });

  test("openings.add_location / remove_location POST openingId + locationId", async () => {
    const add = stubFetch(JSON.stringify(openingLocationAdded));
    await executeOpeningsAddLocation({
      ...auth,
      openingId: OPENING,
      locationId: LOCATION,
      fetch: add.impl,
    });
    expect(new URL(add.calls[0]!.url).pathname).toBe("/opening.addLocation");
    expect(JSON.parse(await add.calls[0]!.text())).toEqual({
      openingId: OPENING,
      locationId: LOCATION,
    });

    const remove = stubFetch(JSON.stringify(openingLocationRemoved));
    const result = await executeOpeningsRemoveLocation({
      ...auth,
      openingId: OPENING,
      locationId: LOCATION,
      fetch: remove.impl,
    });
    expect(new URL(remove.calls[0]!.url).pathname).toBe("/opening.removeLocation");
    expect(result.opening).toBeNull();
  });

  test("openings.remove_location rejects missing openingId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeOpeningsRemoveLocation({ ...auth, openingId: "", locationId: LOCATION, fetch: impl }),
    ).rejects.toThrow(/openingId/);
    expect(calls).toHaveLength(0);
  });

  test("openings.get observe exposes every field the G3 writes mutate", async () => {
    for (const [fixture, check] of [
      [openingArchived, (o: Record<string, any>) => expect(o.isArchived).toBe(true)],
      [openingStateSet, (o: Record<string, any>) => expect(o.openingState).toBe("Closed")],
      [openingJobAdded, (o: Record<string, any>) => expect(o.latestVersion.jobIds).toContain(JOB)],
      [openingJobRemoved, (o: Record<string, any>) => expect(o.latestVersion.jobIds).toEqual([])],
      [
        openingLocationAdded,
        (o: Record<string, any>) => expect(o.latestVersion.locationIds).toContain(LOCATION),
      ],
      [
        openingLocationRemoved,
        (o: Record<string, any>) => expect(o.latestVersion.locationIds).toEqual([]),
      ],
    ] as const) {
      const { calls, impl } = stubFetch(JSON.stringify(fixture));
      const result = await executeOpeningsGet({ ...auth, openingId: OPENING, fetch: impl });
      expect(new URL(calls[0]!.url).pathname).toBe("/opening.info");
      check(result.opening as Record<string, any>);
    }
  });

  test("opening writes surface upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 422 });
    await expect(
      executeOpeningsSetArchived({ ...auth, openingId: OPENING, archive: true, fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Ashby G3 lookups", () => {
  test("locations.list POSTs /location.list with paging", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(locationsList));
    const result = await executeLocationsList({
      ...auth,
      includeArchived: false,
      limit: 2,
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/location.list");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ includeArchived: false, limit: 2 });
    expect(result.locations).toHaveLength(2);
    expect(result.moreDataAvailable).toBe(true);
    expect(result.nextCursor).toBe("cursor-loc-2");
    expect(result.syncToken).toBe("sync-loc-1");
  });

  test("locations.get POSTs /location.info", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(locationInfo));
    const result = await executeLocationsGet({
      ...auth,
      locationId: "9a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/location.info");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      locationId: "9a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d",
    });
    expect((result.location as { name?: string })?.name).toBe("San Francisco");
  });

  test("departments.get POSTs /department.info", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(departmentInfo));
    const result = await executeDepartmentsGet({
      ...auth,
      departmentId: "7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/department.info");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      departmentId: "7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a",
    });
    expect((result.department as { name?: string })?.name).toBe("Engineering");
  });

  test("departments.get rejects missing departmentId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeDepartmentsGet({ ...auth, departmentId: "", fetch: impl })).rejects.toThrow(
      /departmentId/,
    );
    expect(calls).toHaveLength(0);
  });

  test("users.search POSTs /user.search by email", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersSearch));
    const result = await executeUsersSearch({ ...auth, email: "ada@example.com", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/user.search");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ email: "ada@example.com" });
    expect(result.users).toHaveLength(1);
  });

  test("users.search returns [] when no user matches", async () => {
    const { impl } = stubFetch(JSON.stringify({ success: true, results: [] }));
    const result = await executeUsersSearch({ ...auth, email: "nobody@example.com", fetch: impl });
    expect(result.users).toEqual([]);
  });

  test("communication_templates.list POSTs /communicationTemplate.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(communicationTemplatesList));
    const result = await executeCommunicationTemplatesList({
      ...auth,
      ownershipFilter: "personalAndOrg",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/communicationTemplate.list");
    expect(JSON.parse(await calls[0]!.text())).toEqual({ ownershipFilter: "personalAndOrg" });
    expect(result.communicationTemplates).toHaveLength(2);
  });

  test("communication_templates.list rejects unknown ownershipFilter before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeCommunicationTemplatesList({
        ...auth,
        ownershipFilter: "everyone" as unknown as "org",
        fetch: impl,
      }),
    ).rejects.toThrow(/ownershipFilter/);
    expect(calls).toHaveLength(0);
  });

  test("application_hiring_team_roles.list POSTs /applicationHiringTeamRole.list with {}", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationHiringTeamRolesList));
    const result = await executeApplicationHiringTeamRolesList({ ...auth, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/applicationHiringTeamRole.list");
    expect(JSON.parse(await calls[0]!.text())).toEqual({});
    expect(result.roles).toHaveLength(2);
  });
});

describe("Ashby G3 offers (creates; no effect keys)", () => {
  const offerForm = {
    fieldSubmissions: [
      { path: "startDate", value: "2026-11-02" },
      { path: "salary", value: { value: 185000, currencyCode: "USD" } },
    ],
  };

  test("offer_processes.start POSTs /offerProcess.start and returns the new process", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offerProcessStarted));
    const result = await executeOfferProcessesStart({
      ...auth,
      applicationId: "f9e52a51-a075-4116-a7b8-484deba69004",
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe("/offerProcess.start");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      applicationId: "f9e52a51-a075-4116-a7b8-484deba69004",
    });
    expect(result.id).toBe("8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f");
    expect(result.status).toBe("WaitingOnOfferCreation");
  });

  test("offers.start POSTs /offer.start and returns the version with formDefinition", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offerStarted));
    const result = await executeOffersStart({
      ...auth,
      offerProcessId: "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/offer.start");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      offerProcessId: "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
    });
    expect(result.id).toBe("c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f");
    expect(result.formDefinition).toBeTruthy();
  });

  test("offers.create POSTs /offer.create with offerForm.fieldSubmissions", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offerCreated));
    const result = await executeOffersCreate({
      ...auth,
      offerProcessId: "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
      offerFormId: "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
      offerForm,
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe("/offer.create");
    expect(JSON.parse(await calls[0]!.text())).toEqual({
      offerProcessId: "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
      offerFormId: "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
      offerForm,
    });
    expect(result.id).toBe("b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e");
    expect(result.acceptanceStatus).toBe("Created");
  });

  test("offers.create rejects missing fieldSubmissions before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeOffersCreate({
        ...auth,
        offerProcessId: "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
        offerFormId: "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
        offerForm: {} as { fieldSubmissions: [] },
        fetch: impl,
      }),
    ).rejects.toThrow(/fieldSubmissions/);
    expect(calls).toHaveLength(0);
  });

  test("offers.create rejects a submission without path before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeOffersCreate({
        ...auth,
        offerProcessId: "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
        offerFormId: "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
        offerForm: { fieldSubmissions: [{ path: "", value: 1 }] },
        fetch: impl,
      }),
    ).rejects.toThrow(/path/);
    expect(calls).toHaveLength(0);
  });

  test("offers.create fails when the response has no results object", async () => {
    const { impl } = stubFetch(JSON.stringify({ success: true }));
    await expect(
      executeOffersCreate({
        ...auth,
        offerProcessId: "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
        offerFormId: "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
        offerForm,
        fetch: impl,
      }),
    ).rejects.toThrow(/results/);
  });

  test("offers.create does not echo the API key in upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 401 });
    const error = await executeOffersCreate({
      ...auth,
      offerProcessId: "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
      offerFormId: "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
      offerForm,
      fetch: impl,
    }).catch((err: unknown) => err);
    expect(error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(JSON.stringify(error)).not.toContain("fixturekey");
    expect(JSON.stringify(error)).not.toContain("Zml4dHVyZWtleTo");
  });
});
