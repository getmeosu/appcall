import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import deepened from "../fixtures/deepened_response.json";
import versionFixture from "../fixtures/version.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const routes = [
  {
    "key": "groups.bulkModify",
    "method": "PUT",
    "path": "/api/v4/groups_bulk",
    "input": {
      "members": [
        {
          "id": "g-1",
          "addMembers": [
            "c-1"
          ]
        }
      ]
    },
    "query": {
      "members": "[{\"id\":\"g-1\",\"addMembers\":[\"c-1\"]}]"
    },
    "jsonFields": [
      "members"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.copy",
    "method": "POST",
    "path": "/api/v4/copy_folder/f-1",
    "input": {
      "folderId": "f-1",
      "parent": "f-2",
      "title": "Copied folder"
    },
    "query": {
      "parent": "f-2",
      "title": "Copied folder"
    },
    "jsonFields": [
      "addResponsibles",
      "removeResponsibles"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.copyAsync",
    "method": "POST",
    "path": "/api/v4/copy_folder_async/f-1",
    "input": {
      "folderId": "f-1",
      "parent": "f-2",
      "title": "Copied folder async"
    },
    "query": {
      "parent": "f-2",
      "title": "Copied folder async"
    },
    "jsonFields": [
      "addResponsibles",
      "removeResponsibles"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "webhooks.create",
    "method": "POST",
    "path": "/api/v4/webhooks",
    "input": {
      "hookUrl": "https://example.test/wrike"
    },
    "query": {
      "hookUrl": "https://example.test/wrike"
    },
    "jsonFields": [
      "events",
      "customItemTypes",
      "parameterisedEvents"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "assets.create",
    "method": "POST",
    "path": "/api/v4/assets",
    "input": {
      "name": "Camera A"
    },
    "query": {
      "name": "Camera A"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "customfields.create",
    "method": "POST",
    "path": "/api/v4/customfields",
    "input": {
      "title": "Priority score",
      "type": "Text"
    },
    "query": {
      "title": "Priority score",
      "type": "Text"
    },
    "jsonFields": [
      "values",
      "shareds",
      "contacts"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.createBooking",
    "method": "POST",
    "path": "/api/v4/folders/f-1/bookings",
    "input": {
      "folderId": "f-1",
      "bookingDates": {
        "startDate": "2026-01-01",
        "finishDate": "2026-01-31"
      }
    },
    "query": {
      "bookingDates": "{\"startDate\":\"2026-01-01\",\"finishDate\":\"2026-01-31\"}"
    },
    "jsonFields": [
      "bookingDates",
      "effortAllocation"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.createApproval",
    "method": "POST",
    "path": "/api/v4/folders/f-1/approvals",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [
      "approvers",
      "attachments"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.createComment",
    "method": "POST",
    "path": "/api/v4/folders/f-1/comments",
    "input": {
      "folderId": "f-1",
      "text": "Looks good"
    },
    "query": {
      "text": "Looks good"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.createTimelogLockPeriod",
    "method": "POST",
    "path": "/api/v4/folders/f-1/timelog_lock_periods",
    "input": {
      "folderId": "f-1",
      "period": "2026-01-31"
    },
    "query": {
      "period": "2026-01-31"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.createWebhook",
    "method": "POST",
    "path": "/api/v4/folders/f-1/webhooks",
    "input": {
      "folderId": "f-1",
      "hookUrl": "https://example.test/wrike-folder"
    },
    "query": {
      "hookUrl": "https://example.test/wrike-folder"
    },
    "jsonFields": [
      "events"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "groups.create",
    "method": "POST",
    "path": "/api/v4/groups",
    "input": {
      "title": "Design"
    },
    "query": {
      "title": "Design"
    },
    "jsonFields": [
      "members",
      "metadata"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "invitations.create",
    "method": "POST",
    "path": "/api/v4/invitations",
    "input": {
      "email": "ada@example.test"
    },
    "query": {
      "email": "ada@example.test"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.createTimelogLockPeriod",
    "method": "POST",
    "path": "/api/v4/spaces/s-1/timelog_lock_periods",
    "input": {
      "spaceId": "s-1",
      "period": "2026-01-31"
    },
    "query": {
      "period": "2026-01-31"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.createWebhook",
    "method": "POST",
    "path": "/api/v4/spaces/s-1/webhooks",
    "input": {
      "spaceId": "s-1",
      "hookUrl": "https://example.test/wrike-space"
    },
    "query": {
      "hookUrl": "https://example.test/wrike-space"
    },
    "jsonFields": [
      "events"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.createAttachment",
    "method": "POST",
    "path": "/api/v4/tasks/t-1/attachments",
    "input": {
      "taskId": "t-1",
      "fileName": "note.txt",
      "fileContent": "hello-file"
    },
    "query": {},
    "jsonFields": [],
    "raw": true,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.createApproval",
    "method": "POST",
    "path": "/api/v4/tasks/t-1/approvals",
    "input": {
      "taskId": "t-1"
    },
    "query": {},
    "jsonFields": [
      "approvers",
      "attachments"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.createDependency",
    "method": "POST",
    "path": "/api/v4/tasks/t-1/dependencies",
    "input": {
      "taskId": "t-1",
      "predecessorId": "t-0",
      "relationType": "FinishToStart"
    },
    "query": {
      "predecessorId": "t-0",
      "relationType": "FinishToStart"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.createTimelog",
    "method": "POST",
    "path": "/api/v4/tasks/t-1/timelogs",
    "input": {
      "taskId": "t-1",
      "hours": 1.5,
      "trackedDate": "2026-01-15"
    },
    "query": {
      "hours": "1.5",
      "trackedDate": "2026-01-15"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timesheets.create",
    "method": "POST",
    "path": "/api/v4/timesheets",
    "input": {
      "periodStartDate": "2026-01-01"
    },
    "query": {
      "periodStartDate": "2026-01-01"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "workflows.create",
    "method": "POST",
    "path": "/api/v4/workflows",
    "input": {
      "name": "Design review"
    },
    "query": {
      "name": "Design review"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "approvals.delete",
    "method": "DELETE",
    "path": "/api/v4/approvals/ap-1",
    "input": {
      "approvalId": "ap-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "assets.delete",
    "method": "DELETE",
    "path": "/api/v4/assets/as-1",
    "input": {
      "assetId": "as-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "attachments.delete",
    "method": "DELETE",
    "path": "/api/v4/attachments/at-1",
    "input": {
      "attachmentId": "at-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "bookings.delete",
    "method": "DELETE",
    "path": "/api/v4/bookings/bk-1",
    "input": {
      "bookingId": "bk-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "dependencies.delete",
    "method": "DELETE",
    "path": "/api/v4/dependencies/dp-1",
    "input": {
      "dependencyId": "dp-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.delete",
    "method": "DELETE",
    "path": "/api/v4/folders/f-1",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.deleteTimelogLockPeriod",
    "method": "DELETE",
    "path": "/api/v4/folders/f-1/timelog_lock_periods",
    "input": {
      "folderId": "f-1",
      "period": "2026-01-31"
    },
    "query": {
      "period": "2026-01-31"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "groups.delete",
    "method": "DELETE",
    "path": "/api/v4/groups/g-1",
    "input": {
      "groupId": "g-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "invitations.delete",
    "method": "DELETE",
    "path": "/api/v4/invitations/in-1",
    "input": {
      "invitationId": "in-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "jobroles.delete",
    "method": "DELETE",
    "path": "/api/v4/jobroles/jr-1",
    "input": {
      "jobroleId": "jr-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.delete",
    "method": "DELETE",
    "path": "/api/v4/spaces/s-1",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.deleteTimelogLockPeriod",
    "method": "DELETE",
    "path": "/api/v4/spaces/s-1/timelog_lock_periods",
    "input": {
      "spaceId": "s-1",
      "period": "2026-01-31"
    },
    "query": {
      "period": "2026-01-31"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timelogs.delete",
    "method": "DELETE",
    "path": "/api/v4/timelogs/tl-1",
    "input": {
      "timelogId": "tl-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "webhooks.delete",
    "method": "DELETE",
    "path": "/api/v4/webhooks/wh-1",
    "input": {
      "webhookId": "wh-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "account.get",
    "method": "GET",
    "path": "/api/v4/account",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "customfields.list",
    "method": "GET",
    "path": "/api/v4/customfields",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "webhooks.list",
    "method": "GET",
    "path": "/api/v4/webhooks",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "approvals.list",
    "method": "GET",
    "path": "/api/v4/approvals",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "approvals.getByIds",
    "method": "GET",
    "path": "/api/v4/approvals/ap-1",
    "input": {
      "approvalIds": "ap-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "asyncJobs.get",
    "method": "GET",
    "path": "/api/v4/async_job/job-1",
    "input": {
      "asyncJobId": "job-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "attachments.getByIds",
    "method": "GET",
    "path": "/api/v4/attachments/at-1",
    "input": {
      "attachmentIds": "at-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "attachments.download",
    "method": "GET",
    "path": "/api/v4/attachments/at-1/download",
    "input": {
      "attachmentId": "at-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": true,
    "whole": false
  },
  {
    "key": "attachments.preview",
    "method": "GET",
    "path": "/api/v4/attachments/at-1/preview",
    "input": {
      "attachmentId": "at-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": true,
    "whole": false
  },
  {
    "key": "attachments.getUrl",
    "method": "GET",
    "path": "/api/v4/attachments/at-1/url",
    "input": {
      "attachmentId": "at-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "bookings.get",
    "method": "GET",
    "path": "/api/v4/bookings/bk-1",
    "input": {
      "bookingId": "bk-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "colors.list",
    "method": "GET",
    "path": "/api/v4/colors",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "comments.listAccount",
    "method": "GET",
    "path": "/api/v4/comments",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "comments.getByIds",
    "method": "GET",
    "path": "/api/v4/comments/cm-1",
    "input": {
      "commentIds": "cm-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "contacts.getHourlyRates",
    "method": "GET",
    "path": "/api/v4/contacts/c-1/hourly_rates",
    "input": {
      "contactIds": "c-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "contacts.getHistory",
    "method": "GET",
    "path": "/api/v4/contacts/c-1/contacts_history",
    "input": {
      "contactIds": "c-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "contacts.listTimelogs",
    "method": "GET",
    "path": "/api/v4/contacts/c-1/timelogs",
    "input": {
      "contactId": "c-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "customItemTypes.list",
    "method": "GET",
    "path": "/api/v4/custom_item_types",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "dependencies.getByIds",
    "method": "GET",
    "path": "/api/v4/dependencies/dp-1",
    "input": {
      "dependencyIds": "dp-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.listBookings",
    "method": "GET",
    "path": "/api/v4/folders/f-1/bookings",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.listApprovals",
    "method": "GET",
    "path": "/api/v4/folders/f-1/approvals",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.listAttachments",
    "method": "GET",
    "path": "/api/v4/folders/f-1/attachments",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.getByIds",
    "method": "GET",
    "path": "/api/v4/folders/f-1%2Cf-2",
    "input": {
      "folderIds": "f-1,f-2"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.listComments",
    "method": "GET",
    "path": "/api/v4/folders/f-1/comments",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.getHistory",
    "method": "GET",
    "path": "/api/v4/folders/f-1/folders_history",
    "input": {
      "folderIds": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.getHourlyRates",
    "method": "GET",
    "path": "/api/v4/folders/f-1/hourly_rates",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.getRollups",
    "method": "GET",
    "path": "/api/v4/folders/f-1/rollups",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.listTasks",
    "method": "GET",
    "path": "/api/v4/folders/f-1/tasks",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.listTimelogLockPeriods",
    "method": "GET",
    "path": "/api/v4/folders/f-1/timelog_lock_periods",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.listTimelogs",
    "method": "GET",
    "path": "/api/v4/folders/f-1/timelogs",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "ids.convert",
    "method": "GET",
    "path": "/api/v4/ids",
    "input": {
      "ids": "IEAAAA",
      "type": "ApiV2Task"
    },
    "query": {
      "ids": "IEAAAA",
      "type": "ApiV2Task"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "jobroles.getByIds",
    "method": "GET",
    "path": "/api/v4/jobroles/jr-1",
    "input": {
      "jobroleIds": "jr-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "placeholders.getHourlyRates",
    "method": "GET",
    "path": "/api/v4/placeholders/ph-1/hourly_rates",
    "input": {
      "placeholderIds": "ph-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "placeholders.getByIds",
    "method": "GET",
    "path": "/api/v4/placeholders/ph-1",
    "input": {
      "placeholderIds": "ph-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.get",
    "method": "GET",
    "path": "/api/v4/spaces/s-1",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.listCustomItemTypes",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/custom_item_types",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.listFolders",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/folders",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.listCustomfields",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/customfields",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.listTasks",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/tasks",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.listWorkflows",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/workflows",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.listTimelogLockPeriods",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/timelog_lock_periods",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "users.get",
    "method": "GET",
    "path": "/api/v4/users/u-1",
    "input": {
      "userId": "u-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.listDependencies",
    "method": "GET",
    "path": "/api/v4/tasks/t-1/dependencies",
    "input": {
      "taskId": "t-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.listApprovals",
    "method": "GET",
    "path": "/api/v4/tasks/t-1/approvals",
    "input": {
      "taskId": "t-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.getHistory",
    "method": "GET",
    "path": "/api/v4/tasks/t-1/tasks_history",
    "input": {
      "taskIds": "t-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.getRollups",
    "method": "GET",
    "path": "/api/v4/tasks/t-1/rollups",
    "input": {
      "taskId": "t-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.listTimelogLockPeriods",
    "method": "GET",
    "path": "/api/v4/tasks/t-1/timelog_lock_periods",
    "input": {
      "taskId": "t-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.listTimelogs",
    "method": "GET",
    "path": "/api/v4/tasks/t-1/timelogs",
    "input": {
      "taskId": "t-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timelogCategories.list",
    "method": "GET",
    "path": "/api/v4/timelog_categories",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timelogs.list",
    "method": "GET",
    "path": "/api/v4/timelogs",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timelogs.getByIds",
    "method": "GET",
    "path": "/api/v4/timelogs/tl-1",
    "input": {
      "timelogId": "tl-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timesheets.list",
    "method": "GET",
    "path": "/api/v4/timesheets",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timesheetSubmissionRules.list",
    "method": "GET",
    "path": "/api/v4/timesheet_submission_rules",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "version.get",
    "method": "GET",
    "path": "/api/v4/version",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": true
  },
  {
    "key": "webhooks.get",
    "method": "GET",
    "path": "/api/v4/webhooks/wh-1",
    "input": {
      "webhookId": "wh-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "workschedules.getTimesheetRules",
    "method": "GET",
    "path": "/api/v4/workschedules/ws-1/timesheet_submission_rules",
    "input": {
      "workscheduleId": "ws-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folderBlueprints.launchAsync",
    "method": "POST",
    "path": "/api/v4/folder_blueprints/fb-1/launch_async",
    "input": {
      "folderBlueprintId": "fb-1",
      "title": "From blueprint",
      "parent": "f-2"
    },
    "query": {
      "title": "From blueprint",
      "parent": "f-2"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "taskBlueprints.launchAsync",
    "method": "POST",
    "path": "/api/v4/task_blueprints/tb-1/launch_async",
    "input": {
      "taskBlueprintId": "tb-1",
      "title": "From task blueprint"
    },
    "query": {
      "title": "From task blueprint"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "attachments.listAccount",
    "method": "GET",
    "path": "/api/v4/attachments",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folderBlueprints.list",
    "method": "GET",
    "path": "/api/v4/folder_blueprints",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "placeholders.list",
    "method": "GET",
    "path": "/api/v4/placeholders",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.listFolderBlueprints",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/folder_blueprints",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.list",
    "method": "GET",
    "path": "/api/v4/spaces",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "spaces.listTaskBlueprints",
    "method": "GET",
    "path": "/api/v4/spaces/s-1/task_blueprints",
    "input": {
      "spaceId": "s-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.listSubfolders",
    "method": "GET",
    "path": "/api/v4/folders/f-1/folders",
    "input": {
      "folderId": "f-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "taskBlueprints.list",
    "method": "GET",
    "path": "/api/v4/task_blueprints",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "account.update",
    "method": "PUT",
    "path": "/api/v4/account",
    "input": {
      "metadata": [
        {
          "key": "source",
          "value": "appcall"
        }
      ]
    },
    "query": {
      "metadata": "[{\"key\":\"source\",\"value\":\"appcall\"}]"
    },
    "jsonFields": [
      "metadata"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "groups.update",
    "method": "PUT",
    "path": "/api/v4/groups/g-1",
    "input": {
      "groupId": "g-1",
      "title": "Design Ops"
    },
    "query": {
      "title": "Design Ops"
    },
    "jsonFields": [
      "addMembers",
      "removeMembers",
      "metadata"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "customfields.get",
    "method": "GET",
    "path": "/api/v4/customfields/cf-1",
    "input": {
      "customFieldId": "cf-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "invitations.list",
    "method": "GET",
    "path": "/api/v4/invitations",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "jobroles.list",
    "method": "GET",
    "path": "/api/v4/jobroles",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "groups.get",
    "method": "GET",
    "path": "/api/v4/groups/g-1",
    "input": {
      "groupId": "g-1"
    },
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "groups.list",
    "method": "GET",
    "path": "/api/v4/groups",
    "input": {},
    "query": {},
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "ediscovery.search",
    "method": "POST",
    "path": "/api/v4/ediscovery_search",
    "input": {
      "text": "contract"
    },
    "query": {
      "text": "contract"
    },
    "jsonFields": [
      "types"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "approvals.update",
    "method": "PUT",
    "path": "/api/v4/approvals/ap-1",
    "input": {
      "approvalId": "ap-1",
      "dueDate": "2026-02-01"
    },
    "query": {
      "dueDate": "2026-02-01"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "assets.update",
    "method": "PUT",
    "path": "/api/v4/assets/as-1",
    "input": {
      "assetId": "as-1",
      "name": "Camera B"
    },
    "query": {
      "name": "Camera B"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "attachments.update",
    "method": "PUT",
    "path": "/api/v4/attachments/at-1",
    "input": {
      "attachmentId": "at-1",
      "fileName": "note-v2.txt",
      "fileContent": "hello-file-v2"
    },
    "query": {},
    "jsonFields": [],
    "raw": true,
    "binary": false,
    "whole": false
  },
  {
    "key": "bookings.update",
    "method": "PUT",
    "path": "/api/v4/bookings/bk-1",
    "input": {
      "bookingId": "bk-1",
      "bookingDates": {
        "startDate": "2026-02-01",
        "finishDate": "2026-02-28"
      }
    },
    "query": {
      "bookingDates": "{\"startDate\":\"2026-02-01\",\"finishDate\":\"2026-02-28\"}"
    },
    "jsonFields": [
      "bookingDates"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "customfields.update",
    "method": "PUT",
    "path": "/api/v4/customfields/cf-1",
    "input": {
      "customFieldId": "cf-1",
      "title": "Score"
    },
    "query": {
      "title": "Score"
    },
    "jsonFields": [
      "addShareds",
      "removeShareds"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "dependencies.update",
    "method": "PUT",
    "path": "/api/v4/dependencies/dp-1",
    "input": {
      "dependencyId": "dp-1",
      "relationType": "StartToStart"
    },
    "query": {
      "relationType": "StartToStart"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "folders.updateRollups",
    "method": "PUT",
    "path": "/api/v4/folders/f-1/rollups",
    "input": {
      "folderId": "f-1",
      "rollups": {
        "enabled": true
      }
    },
    "query": {
      "rollups": "{\"enabled\":true}"
    },
    "jsonFields": [
      "rollups"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "invitations.update",
    "method": "PUT",
    "path": "/api/v4/invitations/in-1",
    "input": {
      "invitationId": "in-1",
      "resend": true
    },
    "query": {
      "resend": "true"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "jobroles.update",
    "method": "PUT",
    "path": "/api/v4/jobroles/jr-1",
    "input": {
      "jobroleId": "jr-1",
      "name": "Designer"
    },
    "query": {
      "name": "Designer"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "contacts.update",
    "method": "PUT",
    "path": "/api/v4/contacts/c-1",
    "input": {
      "contactId": "c-1",
      "metadata": [
        {
          "key": "source",
          "value": "appcall"
        }
      ]
    },
    "query": {
      "metadata": "[{\"key\":\"source\",\"value\":\"appcall\"}]"
    },
    "jsonFields": [
      "metadata"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "users.update",
    "method": "PUT",
    "path": "/api/v4/users/u-1",
    "input": {
      "userId": "u-1",
      "jobTitle": "PM"
    },
    "query": {
      "jobTitle": "PM"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "tasks.updateRollups",
    "method": "PUT",
    "path": "/api/v4/tasks/t-1/rollups",
    "input": {
      "taskId": "t-1",
      "rollups": {
        "enabled": true
      }
    },
    "query": {
      "rollups": "{\"enabled\":true}"
    },
    "jsonFields": [
      "rollups"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timelogs.update",
    "method": "PUT",
    "path": "/api/v4/timelogs/tl-1",
    "input": {
      "timelogId": "tl-1",
      "hours": 2
    },
    "query": {
      "hours": "2"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timesheetRows.update",
    "method": "PUT",
    "path": "/api/v4/timesheet_rows/tr-1",
    "input": {
      "timesheetRowId": "tr-1",
      "categoryId": "tc-1"
    },
    "query": {
      "categoryId": "tc-1"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "timesheets.update",
    "method": "PUT",
    "path": "/api/v4/timesheets/ts-1",
    "input": {
      "timesheetId": "ts-1",
      "approvalStatus": "Submitted"
    },
    "query": {
      "approvalStatus": "Submitted"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "webhooks.update",
    "method": "PUT",
    "path": "/api/v4/webhooks/wh-1",
    "input": {
      "webhookId": "wh-1",
      "status": "Active"
    },
    "query": {
      "status": "Active"
    },
    "jsonFields": [
      "events"
    ],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "workflows.update",
    "method": "PUT",
    "path": "/api/v4/workflows/wf-1",
    "input": {
      "workflowId": "wf-1",
      "name": "Updated workflow"
    },
    "query": {
      "name": "Updated workflow"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  },
  {
    "key": "workschedules.updateTimesheetRules",
    "method": "PUT",
    "path": "/api/v4/workschedules/ws-1/timesheet_submission_rules",
    "input": {
      "workscheduleId": "ws-1",
      "enabled": true
    },
    "query": {
      "enabled": "true"
    },
    "jsonFields": [],
    "raw": false,
    "binary": false,
    "whole": false
  }
] as const;

describe("wrike composio depth", () => {
  test("every added action compiles to an HTTP handler", () => {
    for (const route of routes) {
      expect(actions[route.key], route.key).toBeTypeOf("function");
    }
  });

  test.each(routes)("executes $key against $method $path", async (route) => {
    const seen: Request[] = [];
    const body = route.binary ? "file-bytes" : JSON.stringify(route.whole ? versionFixture : deepened);
    const result = await actions[route.key]!({
      apiKey: "tok",
      ...route.input,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": route.binary ? "application/octet-stream" : "application/json" },
        });
      },
    });
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe(route.path);
    expect(seen[0]!.method).toBe(route.method);
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer tok");
    for (const [name, value] of Object.entries(route.query)) {
      expect(url.searchParams.get(name), `${route.key} query ${name}`).toBe(String(value));
    }
    if (route.raw) {
      expect(seen[0]!.headers.get("content-type")).toBe("application/octet-stream");
      expect(seen[0]!.headers.get("x-file-name")).toBe(String((route.input as Record<string, unknown>).fileName));
      expect(await seen[0]!.text()).toBe(String((route.input as Record<string, unknown>).fileContent));
    }
    if (route.binary) {
      expect(result.data).toBe("file-bytes");
    } else if (route.whole) {
      expect(result.data).toEqual(versionFixture);
    } else {
      expect(result.data).toEqual(deepened.data);
    }
  });
});
