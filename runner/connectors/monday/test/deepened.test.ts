import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import fixture from "../fixtures/deepened.json";

const { actions } = compileDeclarativeConnector(manifest as never);

const routes = [
  {
    "key": "me.get",
    "contains": "me {",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "account.get",
    "contains": "account {",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "complexity.getQuery",
    "contains": "complexity",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "complexity.getMutation",
    "contains": "mutation",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "versions.list",
    "contains": "versions",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "app.subscription",
    "contains": "app_subscription",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "users.list",
    "contains": "users(",
    "required": [],
    "sample": {
      "limit": 25,
      "page": 1
    },
    "mutation": false
  },
  {
    "key": "users.activate",
    "contains": "activate_users",
    "required": [
      "userIds"
    ],
    "sample": {
      "userIds": [
        "12345678"
      ]
    },
    "mutation": true
  },
  {
    "key": "users.deactivate",
    "contains": "deactivate_users",
    "required": [
      "userIds"
    ],
    "sample": {
      "userIds": [
        "12345678"
      ]
    },
    "mutation": true
  },
  {
    "key": "users.create",
    "contains": "invite_users",
    "required": [
      "emails"
    ],
    "sample": {
      "emails": [
        "new.user@example.com"
      ],
      "userRole": "member"
    },
    "mutation": true
  },
  {
    "key": "users.updateRole",
    "contains": "update_users_role",
    "required": [
      "userIds"
    ],
    "sample": {
      "userIds": [
        "12345678"
      ],
      "newRole": "member"
    },
    "mutation": true
  },
  {
    "key": "workspace.list",
    "contains": "workspaces(",
    "required": [],
    "sample": {
      "limit": 25,
      "page": 1
    },
    "mutation": false
  },
  {
    "key": "workspace.create",
    "contains": "create_workspace",
    "required": [
      "name",
      "kind"
    ],
    "sample": {
      "name": "New Workspace",
      "kind": "open"
    },
    "mutation": true
  },
  {
    "key": "workspace.update",
    "contains": "update_workspace",
    "required": [
      "workspaceId"
    ],
    "sample": {
      "workspaceId": "1234567890",
      "name": "Renamed Workspace"
    },
    "mutation": true
  },
  {
    "key": "workspace.delete",
    "contains": "delete_workspace",
    "required": [
      "workspaceId"
    ],
    "sample": {
      "workspaceId": "1234567890"
    },
    "mutation": true
  },
  {
    "key": "workspace.addUsers",
    "contains": "add_users_to_workspace",
    "required": [
      "workspaceId",
      "userIds"
    ],
    "sample": {
      "workspaceId": "1234567890",
      "userIds": [
        "12345678"
      ],
      "kind": "subscriber"
    },
    "mutation": true
  },
  {
    "key": "workspace.removeUsers",
    "contains": "delete_users_from_workspace",
    "required": [
      "workspaceId",
      "userIds"
    ],
    "sample": {
      "workspaceId": "1234567890",
      "userIds": [
        "12345678"
      ]
    },
    "mutation": true
  },
  {
    "key": "workspace.removeTeams",
    "contains": "delete_teams_from_workspace",
    "required": [
      "workspaceId",
      "teamIds"
    ],
    "sample": {
      "workspaceId": "1234567890",
      "teamIds": [
        "111"
      ]
    },
    "mutation": true
  },
  {
    "key": "board.archive",
    "contains": "archive_board",
    "required": [
      "boardId"
    ],
    "sample": {
      "boardId": "1234567890"
    },
    "mutation": true
  },
  {
    "key": "board.delete",
    "contains": "delete_board",
    "required": [
      "boardId"
    ],
    "sample": {
      "boardId": "1234567890"
    },
    "mutation": true
  },
  {
    "key": "board.duplicate",
    "contains": "duplicate_board",
    "required": [
      "boardId",
      "duplicateType"
    ],
    "sample": {
      "boardId": "1234567890",
      "duplicateType": "duplicate_board_with_structure",
      "boardName": "Board copy"
    },
    "mutation": true
  },
  {
    "key": "board.update",
    "contains": "update_board",
    "required": [
      "boardId",
      "boardAttribute",
      "newValue"
    ],
    "sample": {
      "boardId": "1234567890",
      "boardAttribute": "name",
      "newValue": "Renamed Board"
    },
    "mutation": true
  },
  {
    "key": "board.addUsers",
    "contains": "add_users_to_board",
    "required": [
      "boardId",
      "userIds"
    ],
    "sample": {
      "boardId": "1234567890",
      "userIds": [
        "12345678"
      ],
      "kind": "subscriber"
    },
    "mutation": true
  },
  {
    "key": "board.addSubscribers",
    "contains": "add_subscribers_to_board",
    "required": [
      "boardId",
      "userIds"
    ],
    "sample": {
      "boardId": "1234567890",
      "userIds": [
        "12345678"
      ],
      "kind": "subscriber"
    },
    "mutation": true
  },
  {
    "key": "board.addTeams",
    "contains": "add_teams_to_board",
    "required": [
      "boardId",
      "teamIds"
    ],
    "sample": {
      "boardId": "1234567890",
      "teamIds": [
        "111"
      ],
      "kind": "subscriber"
    },
    "mutation": true
  },
  {
    "key": "board.removeSubscribers",
    "contains": "delete_subscribers_from_board",
    "required": [
      "boardId",
      "userIds"
    ],
    "sample": {
      "boardId": "1234567890",
      "userIds": [
        "12345678"
      ]
    },
    "mutation": true
  },
  {
    "key": "board.removeTeams",
    "contains": "delete_teams_from_board",
    "required": [
      "boardId",
      "teamIds"
    ],
    "sample": {
      "boardId": "1234567890",
      "teamIds": [
        "111"
      ]
    },
    "mutation": true
  },
  {
    "key": "board.views",
    "contains": "views",
    "required": [
      "boardId"
    ],
    "sample": {
      "boardId": "1234567890"
    },
    "mutation": false
  },
  {
    "key": "board.activityLogs",
    "contains": "activity_logs",
    "required": [
      "boardId"
    ],
    "sample": {
      "boardId": "1234567890",
      "limit": 25
    },
    "mutation": false
  },
  {
    "key": "board.muteSettings",
    "contains": "mute_board_settings",
    "required": [
      "boardIds"
    ],
    "sample": {
      "boardIds": [
        "1234567890"
      ]
    },
    "mutation": false
  },
  {
    "key": "board.updateMuteSettings",
    "contains": "update_mute_board_settings",
    "required": [
      "boardId",
      "muteState"
    ],
    "sample": {
      "boardId": "1234567890",
      "muteState": "NOT_MUTED"
    },
    "mutation": true
  },
  {
    "key": "board.setPermission",
    "contains": "set_board_permission",
    "required": [
      "boardId",
      "basicRoleName"
    ],
    "sample": {
      "boardId": "1234567890",
      "basicRoleName": "editor"
    },
    "mutation": true
  },
  {
    "key": "board.convertToProject",
    "contains": "convert_board_to_project",
    "required": [
      "boardId",
      "columnMappings"
    ],
    "sample": {
      "boardId": "1234567890",
      "columnMappings": "{\"status\":\"status\",\"timeline\":\"timeline\",\"owner\":\"person\"}"
    },
    "mutation": true
  },
  {
    "key": "board.connectToPortfolio",
    "contains": "connect_project_to_portfolio",
    "required": [
      "projectBoardId",
      "portfolioBoardId"
    ],
    "sample": {
      "projectBoardId": "1234567890",
      "portfolioBoardId": "9876543210"
    },
    "mutation": true
  },
  {
    "key": "board.updateHierarchy",
    "contains": "update_board_hierarchy",
    "required": [
      "boardId"
    ],
    "sample": {
      "boardId": "1234567890",
      "hierarchyType": "multi_level"
    },
    "mutation": true
  },
  {
    "key": "boards.connectionIds",
    "contains": "columns",
    "required": [],
    "sample": {
      "limit": 25
    },
    "mutation": false
  },
  {
    "key": "columns.list",
    "contains": "columns",
    "required": [
      "boardId"
    ],
    "sample": {
      "boardId": "1234567890"
    },
    "mutation": false
  },
  {
    "key": "columns.get",
    "contains": "columns(",
    "required": [
      "boardIds"
    ],
    "sample": {
      "boardIds": [
        "1234567890"
      ]
    },
    "mutation": false
  },
  {
    "key": "columns.changeSimpleValue",
    "contains": "change_simple_column_value",
    "required": [
      "boardId",
      "itemId",
      "columnId",
      "value"
    ],
    "sample": {
      "boardId": "1234567890",
      "itemId": "1234567890123",
      "columnId": "status",
      "value": "Done"
    },
    "mutation": true
  },
  {
    "key": "column.create",
    "contains": "create_column",
    "required": [
      "boardId",
      "title",
      "columnType"
    ],
    "sample": {
      "boardId": "1234567890",
      "title": "Status",
      "columnType": "status"
    },
    "mutation": true
  },
  {
    "key": "column.update",
    "contains": "update_column",
    "required": [
      "boardId",
      "id",
      "revision",
      "columnType"
    ],
    "sample": {
      "boardId": "1234567890",
      "id": "status",
      "revision": "1",
      "columnType": "status",
      "title": "Stage"
    },
    "mutation": true
  },
  {
    "key": "column.delete",
    "contains": "delete_column",
    "required": [
      "boardId",
      "columnId"
    ],
    "sample": {
      "boardId": "1234567890",
      "columnId": "status"
    },
    "mutation": true
  },
  {
    "key": "views.schema",
    "contains": "get_column_type_schema",
    "required": [
      "columnType"
    ],
    "sample": {
      "columnType": "status"
    },
    "mutation": false
  },
  {
    "key": "group.update",
    "contains": "update_group",
    "required": [
      "boardId",
      "groupId",
      "groupAttribute",
      "newValue"
    ],
    "sample": {
      "boardId": "1234567890",
      "groupId": "group_one",
      "groupAttribute": "title",
      "newValue": "Doing"
    },
    "mutation": true
  },
  {
    "key": "group.delete",
    "contains": "delete_group",
    "required": [
      "boardId",
      "groupId"
    ],
    "sample": {
      "boardId": "1234567890",
      "groupId": "group_one"
    },
    "mutation": true
  },
  {
    "key": "sprints.list",
    "contains": "groups(",
    "required": [
      "boardIds"
    ],
    "sample": {
      "boardIds": [
        "1234567890"
      ]
    },
    "mutation": false
  },
  {
    "key": "item.archive",
    "contains": "archive_item",
    "required": [
      "itemId"
    ],
    "sample": {
      "itemId": "1234567890123"
    },
    "mutation": true
  },
  {
    "key": "item.moveToGroup",
    "contains": "move_item_to_group",
    "required": [
      "itemId",
      "groupId"
    ],
    "sample": {
      "itemId": "1234567890123",
      "groupId": "group_one"
    },
    "mutation": true
  },
  {
    "key": "item.moveToBoard",
    "contains": "move_item_to_board",
    "required": [
      "itemId",
      "boardId",
      "groupId"
    ],
    "sample": {
      "itemId": "1234567890123",
      "boardId": "1234567890",
      "groupId": "group_one"
    },
    "mutation": true
  },
  {
    "key": "items.list",
    "contains": "items(ids:",
    "required": [
      "itemIds"
    ],
    "sample": {
      "itemIds": [
        "1234567890123"
      ]
    },
    "mutation": false
  },
  {
    "key": "items.listByColumnValues",
    "contains": "items_page_by_column_values",
    "required": [
      "boardId",
      "limit"
    ],
    "sample": {
      "boardId": "1234567890",
      "limit": 25,
      "columns": [
        {
          "column_id": "status",
          "column_values": [
            "Done"
          ]
        }
      ]
    },
    "mutation": false
  },
  {
    "key": "items.listSubitems",
    "contains": "subitems",
    "required": [
      "parentItemIds"
    ],
    "sample": {
      "parentItemIds": [
        "1234567890123"
      ]
    },
    "mutation": false
  },
  {
    "key": "teams.list",
    "contains": "teams(",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "team.members",
    "contains": "teams(ids:",
    "required": [
      "teamId"
    ],
    "sample": {
      "teamId": "111"
    },
    "mutation": false
  },
  {
    "key": "team.addUsers",
    "contains": "add_users_to_team",
    "required": [
      "teamId",
      "userIds"
    ],
    "sample": {
      "teamId": "111",
      "userIds": [
        "12345678"
      ]
    },
    "mutation": true
  },
  {
    "key": "team.removeUsers",
    "contains": "delete_users_from_team",
    "required": [
      "teamId",
      "userIds"
    ],
    "sample": {
      "teamId": "111",
      "userIds": [
        "12345678"
      ]
    },
    "mutation": true
  },
  {
    "key": "update.edit",
    "contains": "edit_update",
    "required": [
      "id",
      "body"
    ],
    "sample": {
      "id": "987654321",
      "body": "Edited update"
    },
    "mutation": true
  },
  {
    "key": "update.delete",
    "contains": "delete_update",
    "required": [
      "id"
    ],
    "sample": {
      "id": "987654321"
    },
    "mutation": true
  },
  {
    "key": "update.like",
    "contains": "like_update",
    "required": [
      "updateId"
    ],
    "sample": {
      "updateId": "987654321"
    },
    "mutation": true
  },
  {
    "key": "update.unlike",
    "contains": "unlike_update",
    "required": [
      "updateId"
    ],
    "sample": {
      "updateId": "987654321"
    },
    "mutation": true
  },
  {
    "key": "update.pin",
    "contains": "pin_to_top",
    "required": [
      "id"
    ],
    "sample": {
      "id": "987654321",
      "itemId": "1234567890123"
    },
    "mutation": true
  },
  {
    "key": "update.unpin",
    "contains": "unpin_from_top",
    "required": [
      "id"
    ],
    "sample": {
      "id": "987654321",
      "itemId": "1234567890123"
    },
    "mutation": true
  },
  {
    "key": "update.replies",
    "contains": "replies(",
    "required": [
      "boardIds"
    ],
    "sample": {
      "boardIds": [
        "1234567890"
      ],
      "limit": 25
    },
    "mutation": false
  },
  {
    "key": "notification.create",
    "contains": "create_notification",
    "required": [
      "text",
      "userId",
      "targetId",
      "targetType"
    ],
    "sample": {
      "text": "Please review",
      "userId": "12345678",
      "targetId": "1234567890123",
      "targetType": "Project"
    },
    "mutation": true
  },
  {
    "key": "tags.list",
    "contains": "tags(",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "tag.create",
    "contains": "create_or_get_tag",
    "required": [
      "tagName"
    ],
    "sample": {
      "tagName": "urgent"
    },
    "mutation": true
  },
  {
    "key": "tag.get",
    "contains": "tags(",
    "required": [
      "tagId"
    ],
    "sample": {
      "tagId": 1
    },
    "mutation": false
  },
  {
    "key": "folders.list",
    "contains": "folders(",
    "required": [],
    "sample": {
      "workspaceIds": [
        "1234567890"
      ]
    },
    "mutation": false
  },
  {
    "key": "folder.create",
    "contains": "create_folder",
    "required": [
      "name"
    ],
    "sample": {
      "name": "New folder",
      "workspaceId": "1234567890"
    },
    "mutation": true
  },
  {
    "key": "folder.update",
    "contains": "update_folder",
    "required": [
      "folderId"
    ],
    "sample": {
      "folderId": "15",
      "name": "Updated folder"
    },
    "mutation": true
  },
  {
    "key": "folder.delete",
    "contains": "delete_folder",
    "required": [
      "folderId"
    ],
    "sample": {
      "folderId": "15"
    },
    "mutation": true
  },
  {
    "key": "docs.list",
    "contains": "docs(",
    "required": [],
    "sample": {
      "limit": 25
    },
    "mutation": false
  },
  {
    "key": "docs.create",
    "contains": "create_doc",
    "required": [
      "location"
    ],
    "sample": {
      "location": {
        "workspace": {
          "workspace_id": "1234567890",
          "name": "New doc",
          "kind": "private"
        }
      }
    },
    "mutation": true
  },
  {
    "key": "docs.update",
    "contains": "update_doc_name",
    "required": [
      "docId",
      "name"
    ],
    "sample": {
      "docId": "12345",
      "name": "Renamed doc"
    },
    "mutation": true
  },
  {
    "key": "docs.delete",
    "contains": "delete_doc",
    "required": [
      "docId"
    ],
    "sample": {
      "docId": "12345"
    },
    "mutation": true
  },
  {
    "key": "docs.blocks",
    "contains": "blocks",
    "required": [
      "docIds"
    ],
    "sample": {
      "docIds": [
        "12345"
      ],
      "limit": 25
    },
    "mutation": false
  },
  {
    "key": "docs.importHtml",
    "contains": "import_doc_from_html",
    "required": [
      "html",
      "workspaceId"
    ],
    "sample": {
      "html": "<h1>Hello</h1>",
      "workspaceId": "1234567890",
      "title": "Imported"
    },
    "mutation": true
  },
  {
    "key": "assets.get",
    "contains": "assets(",
    "required": [
      "ids"
    ],
    "sample": {
      "ids": [
        "555"
      ]
    },
    "mutation": false
  },
  {
    "key": "assets.clearColumn",
    "contains": "change_column_value",
    "required": [
      "boardId",
      "itemId",
      "columnId"
    ],
    "sample": {
      "boardId": "1234567890",
      "itemId": "1234567890123",
      "columnId": "files",
      "value": "{}"
    },
    "mutation": true
  },
  {
    "key": "webhooks.list",
    "contains": "webhooks(",
    "required": [
      "boardId"
    ],
    "sample": {
      "boardId": "1234567890"
    },
    "mutation": false
  },
  {
    "key": "dashboard.create",
    "contains": "create_dashboard",
    "required": [
      "name",
      "workspaceId",
      "boardIds"
    ],
    "sample": {
      "name": "Ops dashboard",
      "workspaceId": "1234567890",
      "boardIds": [
        "1234567890"
      ],
      "kind": "PRIVATE"
    },
    "mutation": true
  },
  {
    "key": "dashboards.list",
    "contains": "dashboards(",
    "required": [],
    "sample": {
      "limit": 25
    },
    "mutation": false
  },
  {
    "key": "favorites.list",
    "contains": "favorites",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "audit.list",
    "contains": "audit_logs",
    "required": [],
    "sample": {
      "limit": 25,
      "page": 1
    },
    "mutation": false
  },
  {
    "key": "form.get",
    "contains": "form(",
    "required": [
      "formToken"
    ],
    "sample": {
      "formToken": "frm_abc123"
    },
    "mutation": false
  },
  {
    "key": "timeline.list",
    "contains": "timeline(",
    "required": [
      "id"
    ],
    "sample": {
      "id": "1234567890123",
      "limit": 5
    },
    "mutation": false
  },
  {
    "key": "timeline.get",
    "contains": "timeline_item(",
    "required": [
      "id"
    ],
    "sample": {
      "id": "6376175611"
    },
    "mutation": false
  },
  {
    "key": "timeline.create",
    "contains": "create_timeline_item",
    "required": [
      "itemId",
      "customActivityId",
      "title",
      "timestamp"
    ],
    "sample": {
      "itemId": "1234567890123",
      "customActivityId": "8ca12626-7aeb-3ca7-7z1a-8ebdda488cd2",
      "title": "Call",
      "timestamp": "2024-12-10T10:00:00Z"
    },
    "mutation": true
  },
  {
    "key": "timeline.delete",
    "contains": "delete_timeline_item",
    "required": [
      "id"
    ],
    "sample": {
      "id": "6376175611"
    },
    "mutation": true
  },
  {
    "key": "customActivity.list",
    "contains": "custom_activity",
    "required": [],
    "sample": {},
    "mutation": false
  },
  {
    "key": "customActivity.create",
    "contains": "create_custom_activity",
    "required": [
      "name",
      "color",
      "iconId"
    ],
    "sample": {
      "name": "Site visit",
      "color": "SLATE_BLUE",
      "iconId": "TRIPOD"
    },
    "mutation": true
  },
  {
    "key": "customActivity.delete",
    "contains": "delete_custom_activity",
    "required": [
      "id"
    ],
    "sample": {
      "id": "act_1"
    },
    "mutation": true
  }
] as const;

type Call = { url: string; init?: RequestInit };

function mockJson(body: unknown) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, fetchFn };
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body ?? "{}"));
}

describe("monday composio-aligned GraphQL operations", () => {
  it.each(routes)("executes $key against POST /v2", async (route) => {
    const { calls, fetchFn } = mockJson(fixture);
    const result = (await actions[route.key]!({
      apiToken: "k",
      ...route.sample,
      fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v2");
    expect(calls[0]!.init?.method).toBe("POST");
    const sent = bodyOf(calls[0]!);
    expect(String(sent.query)).toContain(route.contains);
    const headers = new Headers(calls[0]!.init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("k");
    expect(headers.get("API-Version")).toBe("2026-07");
    expect(result).toBeDefined();
  });

  it.each(routes.filter((route) => route.required.length > 0))("requires $key inputs", (route) => {
    for (const field of route.required) {
      const input = { apiToken: "k", ...route.sample } as Record<string, unknown>;
      delete input[field];
      expect(() => actions[route.key]!(input)).toThrow(`${field} is required`);
    }
  });

  it("classifies new GraphQL operations by mutation-vs-query", () => {
    for (const route of routes) {
      expect(manifest.operations[route.key]!.sideEffect).toBe(route.mutation ? "write" : "read");
    }
  });

  it("declares every webhook EventOnly with sideEffect read", () => {
    for (const [key, operation] of Object.entries(manifest.operations)) {
      if ((operation as { kind?: string }).kind !== "webhook") continue;
      expect((operation as { sideEffect?: string }).sideEffect, key).toBe("read");
      expect((operation as { inputSchema?: unknown }).inputSchema, key).toBeUndefined();
      expect((operation as { request?: unknown }).request, key).toBeUndefined();
      expect(String((operation as { title?: string }).title ?? "").length, key).toBeGreaterThan(0);
    }
  });
});
