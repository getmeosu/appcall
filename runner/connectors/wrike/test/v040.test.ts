import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import deepened from "../fixtures/deepened_response.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const routes = [
  {
    "key": "access_roles.list",
    "method": "GET",
    "path": "/api/v4/access_roles",
    "input": {},
    "query": {},
    "jsonFields": []
  },
  {
    "key": "bookings.list",
    "method": "GET",
    "path": "/api/v4/bookings",
    "input": {
      "pageSize": 50
    },
    "query": {
      "pageSize": "50"
    },
    "jsonFields": [
      "fields"
    ]
  },
  {
    "key": "folders.cascading.trigger",
    "method": "POST",
    "path": "/api/v4/folders/f-1/cascading_field_settings",
    "input": {
      "folderId": "f-1",
      "customFieldId": "cf-1"
    },
    "query": {
      "customFieldId": "cf-1"
    },
    "jsonFields": []
  },
  {
    "key": "folders.cascading.delete",
    "method": "DELETE",
    "path": "/api/v4/folders/f-1/cascading_field_settings",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "tasks.cascading.trigger",
    "method": "POST",
    "path": "/api/v4/tasks/t-1/cascading_field_settings",
    "input": {
      "taskId": "t-1",
      "customFieldId": "cf-1"
    },
    "query": {
      "customFieldId": "cf-1"
    },
    "jsonFields": []
  },
  {
    "key": "tasks.cascading.delete",
    "method": "DELETE",
    "path": "/api/v4/tasks/t-1/cascading_field_settings",
    "input": {
      "taskId": "t-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "audit_log.list",
    "method": "GET",
    "path": "/api/v4/audit_log",
    "input": {
      "pageSize": 100
    },
    "query": {
      "pageSize": "100"
    },
    "jsonFields": [
      "eventTypes"
    ]
  },
  {
    "key": "batch.create",
    "method": "POST",
    "path": "/api/v4/batch",
    "input": {
      "operations": [
        {
          "type": "TaskCreate",
          "input": {
            "folderId": "f-1",
            "title": "Batched"
          }
        }
      ]
    },
    "query": {
      "operations": "[{\"type\":\"TaskCreate\",\"input\":{\"folderId\":\"f-1\",\"title\":\"Batched\"}}]"
    },
    "jsonFields": [
      "operations"
    ]
  },
  {
    "key": "workschedules.duplicate",
    "method": "POST",
    "path": "/api/v4/workschedules/ws-1/duplicate",
    "input": {
      "workscheduleId": "ws-1",
      "title": "Copy of default"
    },
    "query": {
      "title": "Copy of default"
    },
    "jsonFields": []
  },
  {
    "key": "customItemTypes.get",
    "method": "GET",
    "path": "/api/v4/custom_item_types/cit-1",
    "input": {
      "customItemTypeIds": "cit-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "customItemTypes.instantiate",
    "method": "POST",
    "path": "/api/v4/custom_item_types/cit-1/instantiate",
    "input": {
      "customItemTypeId": "cit-1",
      "parentId": "f-1",
      "title": "From CIT"
    },
    "query": {
      "parentId": "f-1",
      "title": "From CIT"
    },
    "jsonFields": []
  },
  {
    "key": "data_export.get",
    "method": "GET",
    "path": "/api/v4/data_export",
    "input": {},
    "query": {},
    "jsonFields": []
  },
  {
    "key": "data_export.refresh",
    "method": "POST",
    "path": "/api/v4/data_export",
    "input": {},
    "query": {},
    "jsonFields": []
  },
  {
    "key": "data_export.getById",
    "method": "GET",
    "path": "/api/v4/data_export/de-1",
    "input": {
      "dataExportId": "de-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "data_export.schema.get",
    "method": "GET",
    "path": "/api/v4/data_export_schema",
    "input": {
      "version": "v1"
    },
    "query": {
      "version": "v1"
    },
    "jsonFields": []
  },
  {
    "key": "folders.listDependencies",
    "method": "GET",
    "path": "/api/v4/folders/f-1/dependencies",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "folders.createDependency",
    "method": "POST",
    "path": "/api/v4/folders/f-1/dependencies",
    "input": {
      "folderId": "f-1",
      "targetId": "f-2",
      "relationType": "FinishToStart"
    },
    "query": {
      "targetId": "f-2",
      "relationType": "FinishToStart"
    },
    "jsonFields": []
  },
  {
    "key": "folders.bulkUpdate",
    "method": "PUT",
    "path": "/api/v4/folders/f-1%2Cf-2",
    "input": {
      "folderIds": "f-1,f-2",
      "title": "Bulk title"
    },
    "query": {
      "title": "Bulk title"
    },
    "jsonFields": [
      "addShareds"
    ]
  },
  {
    "key": "folders.updateHourlyRates",
    "method": "PUT",
    "path": "/api/v4/folders/f-1/hourly_rates",
    "input": {
      "folderId": "f-1",
      "rates": [
        {
          "contactId": "c-1",
          "rate": 120
        }
      ]
    },
    "query": {
      "rates": "[{\"contactId\":\"c-1\",\"rate\":120}]"
    },
    "jsonFields": [
      "rates"
    ]
  },
  {
    "key": "hourly_rates.update",
    "method": "PUT",
    "path": "/api/v4/hourly_rates",
    "input": {
      "rates": [
        {
          "contactId": "c-1",
          "rate": 95
        }
      ]
    },
    "query": {
      "rates": "[{\"contactId\":\"c-1\",\"rate\":95}]"
    },
    "jsonFields": [
      "rates"
    ]
  },
  {
    "key": "folders.excludeProjectTeamMembers",
    "method": "DELETE",
    "path": "/api/v4/folders/f-1/project_team_members",
    "input": {
      "folderId": "f-1",
      "members": [
        "c-1"
      ]
    },
    "query": {
      "members": "[\"c-1\"]"
    },
    "jsonFields": [
      "members"
    ]
  },
  {
    "key": "contacts.provisionHourlyRates",
    "method": "PUT",
    "path": "/api/v4/contacts/c-1/hourly_rates_provision",
    "input": {
      "contactIds": "c-1",
      "rates": [
        {
          "rate": 80
        }
      ]
    },
    "query": {
      "rates": "[{\"rate\":80}]"
    },
    "jsonFields": [
      "rates"
    ]
  },
  {
    "key": "jobroles.create",
    "method": "POST",
    "path": "/api/v4/jobroles",
    "input": {
      "title": "Producer",
      "shortTitle": "PR"
    },
    "query": {
      "title": "Producer",
      "shortTitle": "PR"
    },
    "jsonFields": []
  },
  {
    "key": "request_forms.list",
    "method": "GET",
    "path": "/api/v4/request_forms",
    "input": {},
    "query": {},
    "jsonFields": []
  },
  {
    "key": "request_forms.get",
    "method": "GET",
    "path": "/api/v4/request_forms/rf-1",
    "input": {
      "requestFormId": "rf-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "request_forms.prefillUrl",
    "method": "POST",
    "path": "/api/v4/request_forms/rf-1/prefill_url",
    "input": {
      "requestFormId": "rf-1",
      "values": {
        "title": "Prefill"
      }
    },
    "query": {
      "values": "{\"title\":\"Prefill\"}"
    },
    "jsonFields": [
      "values"
    ]
  },
  {
    "key": "request_forms.submit",
    "method": "POST",
    "path": "/api/v4/request_forms/rf-1/submit",
    "input": {
      "requestFormId": "rf-1",
      "values": {
        "title": "Intake"
      }
    },
    "query": {
      "values": "{\"title\":\"Intake\"}"
    },
    "jsonFields": [
      "values"
    ]
  },
  {
    "key": "spaces.listRequestForms",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/request_forms",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "spaces.create",
    "method": "POST",
    "path": "/api/v4/spaces",
    "input": {
      "title": "Marketing",
      "accessType": "Private"
    },
    "query": {
      "title": "Marketing",
      "accessType": "Private"
    },
    "jsonFields": [
      "members",
      "suggestedProjectWorkflows",
      "suggestedTaskWorkflows",
      "fields"
    ]
  },
  {
    "key": "spaces.update",
    "method": "PUT",
    "path": "/api/v4/spaces/s-1",
    "input": {
      "spaceId": "s-1",
      "title": "Marketing 2026"
    },
    "query": {
      "title": "Marketing 2026"
    },
    "jsonFields": []
  },
  {
    "key": "tasks.bulkUpdate",
    "method": "PUT",
    "path": "/api/v4/tasks/t-1%2Ct-2",
    "input": {
      "taskIds": "t-1,t-2",
      "status": "Completed"
    },
    "query": {
      "status": "Completed"
    },
    "jsonFields": [
      "addResponsibles"
    ]
  },
  {
    "key": "user_types.list",
    "method": "GET",
    "path": "/api/v4/user_types",
    "input": {},
    "query": {},
    "jsonFields": []
  },
  {
    "key": "users.bulkUpdate",
    "method": "PUT",
    "path": "/api/v4/users/u-1",
    "input": {
      "userIds": "u-1",
      "active": false
    },
    "query": {
      "active": "false"
    },
    "jsonFields": []
  },
  {
    "key": "whiteboard_ids.convert",
    "method": "GET",
    "path": "/api/v4/whiteboard_ids",
    "input": {
      "ids": [
        "wb-1"
      ],
      "type": "Wrike"
    },
    "query": {
      "ids": "[\"wb-1\"]",
      "type": "Wrike"
    },
    "jsonFields": [
      "ids"
    ]
  },
  {
    "key": "workschedules.list",
    "method": "GET",
    "path": "/api/v4/workschedules",
    "input": {},
    "query": {},
    "jsonFields": []
  },
  {
    "key": "workschedules.get",
    "method": "GET",
    "path": "/api/v4/workschedules/ws-1",
    "input": {
      "workscheduleId": "ws-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "workschedules.create",
    "method": "POST",
    "path": "/api/v4/workschedules",
    "input": {
      "title": "US 40h",
      "workweek": {
        "hours": 40
      }
    },
    "query": {
      "title": "US 40h",
      "workweek": "{\"hours\":40}"
    },
    "jsonFields": [
      "workweek"
    ]
  },
  {
    "key": "workschedules.update",
    "method": "PUT",
    "path": "/api/v4/workschedules/ws-1",
    "input": {
      "workscheduleId": "ws-1",
      "title": "US 35h"
    },
    "query": {
      "title": "US 35h"
    },
    "jsonFields": [
      "workweek"
    ]
  },
  {
    "key": "workschedules.delete",
    "method": "DELETE",
    "path": "/api/v4/workschedules/ws-1",
    "input": {
      "workscheduleId": "ws-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "workschedule_capacity_changes.list",
    "method": "GET",
    "path": "/api/v4/workschedules/ws-1/workschedule_capacity_change",
    "input": {
      "workscheduleId": "ws-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "workschedule_capacity_changes.get",
    "method": "GET",
    "path": "/api/v4/workschedule_capacity_change/cc-1",
    "input": {
      "changeIds": "cc-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "workschedule_capacity_changes.create",
    "method": "POST",
    "path": "/api/v4/workschedules/ws-1/workschedule_capacity_change",
    "input": {
      "workscheduleId": "ws-1",
      "date": "2026-01-15",
      "capacity": 32
    },
    "query": {
      "date": "2026-01-15",
      "capacity": "32"
    },
    "jsonFields": []
  },
  {
    "key": "workschedule_capacity_changes.update",
    "method": "PUT",
    "path": "/api/v4/workschedule_capacity_change/cc-1",
    "input": {
      "changeId": "cc-1",
      "capacity": 24
    },
    "query": {
      "capacity": "24"
    },
    "jsonFields": []
  },
  {
    "key": "workschedule_capacity_changes.delete",
    "method": "DELETE",
    "path": "/api/v4/workschedule_capacity_change/cc-1",
    "input": {
      "changeId": "cc-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "workschedule_exclusions.list",
    "method": "GET",
    "path": "/api/v4/workschedules/ws-1/workschedule_exclusions",
    "input": {
      "workscheduleId": "ws-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "workschedule_exclusions.get",
    "method": "GET",
    "path": "/api/v4/workschedule_exclusions/ex-1",
    "input": {
      "exclusionId": "ex-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "workschedule_exclusions.create",
    "method": "POST",
    "path": "/api/v4/workschedules/ws-1/workschedule_exclusions",
    "input": {
      "workscheduleId": "ws-1",
      "date": "2026-12-25",
      "isWorkday": false
    },
    "query": {
      "date": "2026-12-25",
      "isWorkday": "false"
    },
    "jsonFields": []
  },
  {
    "key": "workschedule_exclusions.update",
    "method": "PUT",
    "path": "/api/v4/workschedule_exclusions/ex-1",
    "input": {
      "exclusionId": "ex-1",
      "isWorkday": true
    },
    "query": {
      "isWorkday": "true"
    },
    "jsonFields": []
  },
  {
    "key": "workschedule_exclusions.delete",
    "method": "DELETE",
    "path": "/api/v4/workschedule_exclusions/ex-1",
    "input": {
      "exclusionId": "ex-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "user_schedule_capacity_changes.list",
    "method": "GET",
    "path": "/api/v4/user_schedule_capacity_change",
    "input": {
      "userIds": [
        "u-1"
      ]
    },
    "query": {
      "userIds": "[\"u-1\"]"
    },
    "jsonFields": [
      "userIds"
    ]
  },
  {
    "key": "user_schedule_capacity_changes.get",
    "method": "GET",
    "path": "/api/v4/user_schedule_capacity_change/ucc-1",
    "input": {
      "changeIds": "ucc-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "user_schedule_capacity_changes.create",
    "method": "POST",
    "path": "/api/v4/users/u-1/user_schedule_capacity_change",
    "input": {
      "userId": "u-1",
      "date": "2026-02-01",
      "capacity": 20
    },
    "query": {
      "date": "2026-02-01",
      "capacity": "20"
    },
    "jsonFields": []
  },
  {
    "key": "user_schedule_capacity_changes.update",
    "method": "PUT",
    "path": "/api/v4/user_schedule_capacity_change/ucc-1",
    "input": {
      "changeId": "ucc-1",
      "capacity": 16
    },
    "query": {
      "capacity": "16"
    },
    "jsonFields": []
  },
  {
    "key": "user_schedule_capacity_changes.delete",
    "method": "DELETE",
    "path": "/api/v4/user_schedule_capacity_change/ucc-1",
    "input": {
      "changeId": "ucc-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "user_schedule_exclusions.list",
    "method": "GET",
    "path": "/api/v4/user_schedule_exclusions",
    "input": {
      "userIds": [
        "u-1"
      ],
      "startDate": "2026-01-01",
      "endDate": "2026-01-31"
    },
    "query": {
      "userIds": "[\"u-1\"]",
      "startDate": "2026-01-01",
      "endDate": "2026-01-31"
    },
    "jsonFields": [
      "userIds"
    ]
  },
  {
    "key": "user_schedule_exclusions.get",
    "method": "GET",
    "path": "/api/v4/user_schedule_exclusions/uex-1",
    "input": {
      "exclusionId": "uex-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "user_schedule_exclusions.create",
    "method": "POST",
    "path": "/api/v4/user_schedule_exclusions",
    "input": {
      "userId": "u-1",
      "date": "2026-07-04",
      "isWorkday": false
    },
    "query": {
      "userId": "u-1",
      "date": "2026-07-04",
      "isWorkday": "false"
    },
    "jsonFields": []
  },
  {
    "key": "user_schedule_exclusions.update",
    "method": "PUT",
    "path": "/api/v4/user_schedule_exclusions/uex-1",
    "input": {
      "exclusionId": "uex-1",
      "isWorkday": true
    },
    "query": {
      "isWorkday": "true"
    },
    "jsonFields": []
  },
  {
    "key": "user_schedule_exclusions.delete",
    "method": "DELETE",
    "path": "/api/v4/user_schedule_exclusions/uex-1",
    "input": {
      "exclusionId": "uex-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "user_schedule_partial_exclusions.list",
    "method": "GET",
    "path": "/api/v4/user_schedule_partial_exclusion",
    "input": {
      "userIds": [
        "u-1"
      ]
    },
    "query": {
      "userIds": "[\"u-1\"]"
    },
    "jsonFields": [
      "userIds"
    ]
  },
  {
    "key": "user_schedule_partial_exclusions.get",
    "method": "GET",
    "path": "/api/v4/user_schedule_partial_exclusion/upe-1",
    "input": {
      "ids": "upe-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "user_schedule_partial_exclusions.create",
    "method": "POST",
    "path": "/api/v4/user_schedule_partial_exclusion",
    "input": {
      "userId": "u-1",
      "date": "2026-03-01",
      "hours": 4
    },
    "query": {
      "userId": "u-1",
      "date": "2026-03-01",
      "hours": "4"
    },
    "jsonFields": []
  },
  {
    "key": "user_schedule_partial_exclusions.update",
    "method": "PUT",
    "path": "/api/v4/user_schedule_partial_exclusion/upe-1",
    "input": {
      "id": "upe-1",
      "hours": 3
    },
    "query": {
      "hours": "3"
    },
    "jsonFields": []
  },
  {
    "key": "user_schedule_partial_exclusions.delete",
    "method": "DELETE",
    "path": "/api/v4/user_schedule_partial_exclusion/upe-1",
    "input": {
      "id": "upe-1"
    },
    "query": {},
    "jsonFields": []
  },
  {
    "key": "timelog_categories.listTimelogs",
    "method": "GET",
    "path": "/api/v4/timelog_categories/tc-1/timelogs",
    "input": {
      "categoryId": "tc-1",
      "pageSize": 50
    },
    "query": {
      "pageSize": "50"
    },
    "jsonFields": [
      "trackedDate"
    ]
  }
] as const;

describe("wrike v0.4.0 official API depth", () => {
  test("every added action compiles to an HTTP handler", () => {
    for (const route of routes) {
      expect(actions[route.key], route.key).toBeTypeOf("function");
    }
  });

  test.each(routes)("executes $key against $method $path", async (route) => {
    const seen: Request[] = [];
    const result = await actions[route.key]!({
      apiKey: "tok",
      ...route.input,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify(deepened), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe(route.path);
    expect(seen[0]!.method).toBe(route.method);
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer tok");
    expect(seen[0]!.headers.get("content-type")).toBeNull();
    expect(await seen[0]!.text()).toBe("");
    for (const [name, value] of Object.entries(route.query)) {
      expect(url.searchParams.get(name), `${route.key} query ${name}`).toBe(String(value));
    }
    expect(result.data).toEqual(deepened.data);
  });

  test("GET and DELETE never send a body and omit JSON Content-Type", async () => {
    for (const [key, operation] of Object.entries(manifest.operations as Record<string, any>)) {
      if (operation.kind !== "action") continue;
      const method = operation.request?.method;
      if (method !== "GET" && method !== "DELETE") continue;
      expect(operation.request.body, key).toBeUndefined();
      const headers = operation.request.headers ?? {};
      expect(headers["Content-Type"] ?? headers["content-type"], key).toBeUndefined();
    }
  });

  test("JSON Content-Type is only present when a body is set", () => {
    for (const [key, operation] of Object.entries(manifest.operations as Record<string, any>)) {
      if (operation.kind !== "action") continue;
      const headers = operation.request?.headers ?? {};
      const ct = headers["Content-Type"] ?? headers["content-type"];
      if (ct === "application/json") {
        expect(operation.request.body, key).toBeDefined();
      }
      if (operation.request?.body === undefined) {
        expect(ct, key).not.toBe("application/json");
      }
    }
  });
});
