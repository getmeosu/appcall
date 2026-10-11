import { createCalComClient, isRecord, unwrapEnvelope, parseCalComRateLimit } from "./http";

export type CalComExtendedSpec = {
  op: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  required: string[];
  query: string[];
  result: string;
  version: string;
  secret: boolean;
};

const ALIASES: Record<string, string[]> = {
  "bookingUid": [
    "bookingId",
    "uid"
  ],
  "webhookId": [
    "id"
  ],
  "xCalSecretKey": [
    "x_cal_secret_key"
  ],
  "orgId": [
    "organizationId",
    "org_id"
  ],
  "teamId": [
    "team_id"
  ],
  "eventTypeId": [
    "event_type_id"
  ],
  "userId": [
    "user_id"
  ],
  "externalId": [
    "external_id"
  ],
  "eventUid": [
    "event_uid"
  ],
  "clientId": [
    "client_id"
  ],
  "slotStart": [
    "start"
  ]
};

const RESERVED = new Set(["accessToken", "fetch"]);

export const CAL_COM_EXTENDED_SPECS: CalComExtendedSpec[] = [
  {
    "op": "me.update",
    "method": "PATCH",
    "path": "/me",
    "required": [],
    "query": [],
    "result": "user",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "schedules.default.get",
    "method": "GET",
    "path": "/schedules/default",
    "required": [],
    "query": [],
    "result": "schedule",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "bookings.attendees.list",
    "method": "GET",
    "path": "/bookings/{bookingUid}/attendees",
    "required": [
      "bookingUid"
    ],
    "query": [],
    "result": "attendees",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.attendees.add",
    "method": "POST",
    "path": "/bookings/{bookingUid}/attendees",
    "required": [
      "bookingUid",
      "name",
      "email",
      "timeZone"
    ],
    "query": [],
    "result": "attendee",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.attendees.get",
    "method": "GET",
    "path": "/bookings/{bookingUid}/attendees/{attendeeId}",
    "required": [
      "bookingUid",
      "attendeeId"
    ],
    "query": [],
    "result": "attendee",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.references.list",
    "method": "GET",
    "path": "/bookings/{bookingUid}/references",
    "required": [
      "bookingUid"
    ],
    "query": [
      "type"
    ],
    "result": "references",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.mark_absent",
    "method": "POST",
    "path": "/bookings/{bookingUid}/mark-absent",
    "required": [
      "bookingUid"
    ],
    "query": [],
    "result": "booking",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.reassign",
    "method": "POST",
    "path": "/bookings/{bookingUid}/reassign/{userId}",
    "required": [
      "bookingUid",
      "userId"
    ],
    "query": [],
    "result": "booking",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.reassign_auto",
    "method": "POST",
    "path": "/bookings/{bookingUid}/reassign",
    "required": [
      "bookingUid"
    ],
    "query": [],
    "result": "booking",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.location.update",
    "method": "PATCH",
    "path": "/bookings/{bookingUid}/location",
    "required": [
      "bookingUid"
    ],
    "query": [],
    "result": "booking",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "slots.reserve",
    "method": "POST",
    "path": "/slots/reservations",
    "required": [
      "eventTypeId",
      "slotStart"
    ],
    "query": [],
    "result": "reservation",
    "version": "2024-09-04",
    "secret": false
  },
  {
    "op": "slots.reservations.delete",
    "method": "DELETE",
    "path": "/slots/reservations/{uid}",
    "required": [
      "uid"
    ],
    "query": [],
    "result": "reservation",
    "version": "2024-09-04",
    "secret": false
  },
  {
    "op": "calendars.list",
    "method": "GET",
    "path": "/calendars",
    "required": [],
    "query": [],
    "result": "calendars",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.check",
    "method": "GET",
    "path": "/calendars/{calendar}/check",
    "required": [
      "calendar"
    ],
    "query": [],
    "result": "status",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.google.check",
    "method": "GET",
    "path": "/calendars/google/check",
    "required": [],
    "query": [],
    "result": "status",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.connect",
    "method": "GET",
    "path": "/calendars/{calendar}/connect",
    "required": [
      "calendar"
    ],
    "query": [
      "redir"
    ],
    "result": "url",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.ics.check",
    "method": "GET",
    "path": "/calendars/ics-feed/check",
    "required": [],
    "query": [
      "url",
      "urls"
    ],
    "result": "status",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.ics.save",
    "method": "POST",
    "path": "/calendars/ics-feed/save",
    "required": [
      "urls"
    ],
    "query": [],
    "result": "calendars",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.credentials.create",
    "method": "POST",
    "path": "/calendars/{calendar}/credentials",
    "required": [
      "calendar",
      "username",
      "password"
    ],
    "query": [],
    "result": "credential",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.save",
    "method": "GET",
    "path": "/calendars/{calendar}/save",
    "required": [
      "calendar",
      "state",
      "code"
    ],
    "query": [
      "state",
      "code"
    ],
    "result": "credential",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.disconnect",
    "method": "POST",
    "path": "/calendars/{calendar}/disconnect",
    "required": [
      "calendar",
      "id"
    ],
    "query": [],
    "result": "result",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "destination_calendars.update",
    "method": "PUT",
    "path": "/destination-calendars",
    "required": [
      "integration",
      "externalId"
    ],
    "query": [],
    "result": "destinationCalendar",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "selected_calendars.create",
    "method": "POST",
    "path": "/selected-calendars",
    "required": [
      "integration",
      "externalId",
      "credentialId"
    ],
    "query": [],
    "result": "selectedCalendar",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "selected_calendars.delete",
    "method": "DELETE",
    "path": "/selected-calendars",
    "required": [
      "integration",
      "externalId",
      "credentialId"
    ],
    "query": [
      "integration",
      "externalId",
      "credentialId",
      "delegationCredentialId"
    ],
    "result": "selectedCalendar",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "event_types.private_links.list",
    "method": "GET",
    "path": "/event-types/{eventTypeId}/private-links",
    "required": [
      "eventTypeId"
    ],
    "query": [],
    "result": "privateLinks",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "event_types.private_links.update",
    "method": "PATCH",
    "path": "/event-types/{eventTypeId}/private-links/{linkId}",
    "required": [
      "eventTypeId",
      "linkId"
    ],
    "query": [],
    "result": "privateLink",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "event_types.webhooks.create",
    "method": "POST",
    "path": "/event-types/{eventTypeId}/webhooks",
    "required": [
      "eventTypeId",
      "subscriberUrl",
      "triggers",
      "active"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "event_types.webhooks.list",
    "method": "GET",
    "path": "/event-types/{eventTypeId}/webhooks",
    "required": [
      "eventTypeId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "webhooks",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "event_types.webhooks.update",
    "method": "PATCH",
    "path": "/event-types/{eventTypeId}/webhooks/{webhookId}",
    "required": [
      "eventTypeId",
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "event_types.webhooks.delete",
    "method": "DELETE",
    "path": "/event-types/{eventTypeId}/webhooks/{webhookId}",
    "required": [
      "eventTypeId",
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "event_types.webhooks.delete_all",
    "method": "DELETE",
    "path": "/event-types/{eventTypeId}/webhooks",
    "required": [
      "eventTypeId"
    ],
    "query": [],
    "result": "webhooks",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "webhooks.update",
    "method": "PATCH",
    "path": "/webhooks/{webhookId}",
    "required": [
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.list",
    "method": "GET",
    "path": "/teams",
    "required": [],
    "query": [],
    "result": "teams",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.get",
    "method": "GET",
    "path": "/teams/{teamId}",
    "required": [
      "teamId"
    ],
    "query": [],
    "result": "team",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.create",
    "method": "POST",
    "path": "/teams",
    "required": [
      "name"
    ],
    "query": [],
    "result": "team",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.update",
    "method": "PATCH",
    "path": "/teams/{teamId}",
    "required": [
      "teamId"
    ],
    "query": [],
    "result": "team",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.delete",
    "method": "DELETE",
    "path": "/teams/{teamId}",
    "required": [
      "teamId"
    ],
    "query": [],
    "result": "team",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.invite.create",
    "method": "POST",
    "path": "/teams/{teamId}/invite",
    "required": [
      "teamId"
    ],
    "query": [],
    "result": "invite",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.event_types.list",
    "method": "GET",
    "path": "/teams/{teamId}/event-types",
    "required": [
      "teamId"
    ],
    "query": [],
    "result": "eventTypes",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "teams.event_types.get",
    "method": "GET",
    "path": "/teams/{teamId}/event-types/{eventTypeId}",
    "required": [
      "teamId",
      "eventTypeId"
    ],
    "query": [],
    "result": "eventType",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "teams.event_types.create",
    "method": "POST",
    "path": "/teams/{teamId}/event-types",
    "required": [
      "teamId",
      "title",
      "slug",
      "lengthInMinutes"
    ],
    "query": [],
    "result": "eventType",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "teams.event_types.update",
    "method": "PATCH",
    "path": "/teams/{teamId}/event-types/{eventTypeId}",
    "required": [
      "teamId",
      "eventTypeId"
    ],
    "query": [],
    "result": "eventType",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "teams.event_types.delete",
    "method": "DELETE",
    "path": "/teams/{teamId}/event-types/{eventTypeId}",
    "required": [
      "teamId",
      "eventTypeId"
    ],
    "query": [],
    "result": "eventType",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "teams.bookings.list",
    "method": "GET",
    "path": "/teams/{teamId}/bookings",
    "required": [
      "teamId"
    ],
    "query": [
      "status",
      "take",
      "skip",
      "cursor"
    ],
    "result": "bookings",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.schedules.list",
    "method": "GET",
    "path": "/teams/{teamId}/schedules",
    "required": [
      "teamId"
    ],
    "query": [],
    "result": "schedules",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "teams.memberships.list",
    "method": "GET",
    "path": "/teams/{teamId}/memberships",
    "required": [
      "teamId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "memberships",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.memberships.get",
    "method": "GET",
    "path": "/teams/{teamId}/memberships/{membershipId}",
    "required": [
      "teamId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.memberships.create",
    "method": "POST",
    "path": "/teams/{teamId}/memberships",
    "required": [
      "teamId",
      "userId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.memberships.update",
    "method": "PATCH",
    "path": "/teams/{teamId}/memberships/{membershipId}",
    "required": [
      "teamId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.memberships.delete",
    "method": "DELETE",
    "path": "/teams/{teamId}/memberships/{membershipId}",
    "required": [
      "teamId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.event_types.webhooks.list",
    "method": "GET",
    "path": "/teams/{teamId}/event-types/{eventTypeId}/webhooks",
    "required": [
      "teamId",
      "eventTypeId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "webhooks",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.event_types.webhooks.get",
    "method": "GET",
    "path": "/teams/{teamId}/event-types/{eventTypeId}/webhooks/{webhookId}",
    "required": [
      "teamId",
      "eventTypeId",
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.event_types.webhooks.update",
    "method": "PATCH",
    "path": "/teams/{teamId}/event-types/{eventTypeId}/webhooks/{webhookId}",
    "required": [
      "teamId",
      "eventTypeId",
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.event_types.webhooks.delete_all",
    "method": "DELETE",
    "path": "/teams/{teamId}/event-types/{eventTypeId}/webhooks",
    "required": [
      "teamId",
      "eventTypeId"
    ],
    "query": [],
    "result": "webhooks",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "teams.phone_calls.create",
    "method": "POST",
    "path": "/teams/{teamId}/event-types/{eventTypeId}/create-phone-call",
    "required": [
      "teamId",
      "eventTypeId",
      "yourPhoneNumber",
      "numberToCall",
      "calApiKey",
      "enabled",
      "templateType"
    ],
    "query": [],
    "result": "phoneCall",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "conferencing.list",
    "method": "GET",
    "path": "/conferencing",
    "required": [],
    "query": [],
    "result": "apps",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "conferencing.default.get",
    "method": "GET",
    "path": "/conferencing/default",
    "required": [],
    "query": [],
    "result": "app",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "conferencing.default.set",
    "method": "POST",
    "path": "/conferencing/{app}/default",
    "required": [
      "app"
    ],
    "query": [],
    "result": "app",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "conferencing.connect",
    "method": "POST",
    "path": "/conferencing/{app}/connect",
    "required": [
      "app"
    ],
    "query": [],
    "result": "app",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "conferencing.oauth.auth_url",
    "method": "GET",
    "path": "/conferencing/{app}/oauth/auth-url",
    "required": [
      "app"
    ],
    "query": [
      "returnTo"
    ],
    "result": "url",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "conferencing.oauth.callback",
    "method": "GET",
    "path": "/conferencing/{app}/oauth/callback",
    "required": [
      "app"
    ],
    "query": [
      "state",
      "code"
    ],
    "result": "app",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "conferencing.disconnect",
    "method": "DELETE",
    "path": "/conferencing/{app}/disconnect",
    "required": [
      "app"
    ],
    "query": [],
    "result": "result",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "stripe.check",
    "method": "GET",
    "path": "/stripe/check",
    "required": [],
    "query": [],
    "result": "status",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "stripe.connect",
    "method": "GET",
    "path": "/stripe/connect",
    "required": [],
    "query": [],
    "result": "url",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "stripe.save",
    "method": "GET",
    "path": "/stripe/save",
    "required": [],
    "query": [
      "state",
      "code"
    ],
    "result": "status",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "timezones.list",
    "method": "GET",
    "path": "/timezones",
    "required": [],
    "query": [
      "search"
    ],
    "result": "timezones",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "verified_resources.phones.list",
    "method": "GET",
    "path": "/verified-resources/phones",
    "required": [],
    "query": [],
    "result": "phones",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "verified_resources.emails.request_code",
    "method": "POST",
    "path": "/verified-resources/emails/verification-code/request",
    "required": [
      "email"
    ],
    "query": [],
    "result": "result",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.memberships.list",
    "method": "GET",
    "path": "/organizations/{orgId}/memberships",
    "required": [
      "orgId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "memberships",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.memberships.create",
    "method": "POST",
    "path": "/organizations/{orgId}/memberships",
    "required": [
      "orgId",
      "userId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.memberships.get",
    "method": "GET",
    "path": "/organizations/{orgId}/memberships/{membershipId}",
    "required": [
      "orgId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.memberships.update",
    "method": "PATCH",
    "path": "/organizations/{orgId}/memberships/{membershipId}",
    "required": [
      "orgId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.memberships.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/memberships/{membershipId}",
    "required": [
      "orgId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.users.list",
    "method": "GET",
    "path": "/organizations/{orgId}/users",
    "required": [
      "orgId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "users",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.users.create",
    "method": "POST",
    "path": "/organizations/{orgId}/users",
    "required": [
      "orgId",
      "email"
    ],
    "query": [],
    "result": "user",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.users.update",
    "method": "PATCH",
    "path": "/organizations/{orgId}/users/{userId}",
    "required": [
      "orgId",
      "userId"
    ],
    "query": [],
    "result": "user",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.users.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/users/{userId}",
    "required": [
      "orgId",
      "userId"
    ],
    "query": [],
    "result": "user",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.list",
    "method": "GET",
    "path": "/organizations/{orgId}/teams",
    "required": [
      "orgId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "teams",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.create",
    "method": "POST",
    "path": "/organizations/{orgId}/teams",
    "required": [
      "orgId",
      "name"
    ],
    "query": [],
    "result": "team",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.me",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/me",
    "required": [
      "orgId"
    ],
    "query": [],
    "result": "teams",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.get",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [],
    "result": "team",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/teams/{teamId}",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [],
    "result": "team",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.memberships.list",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/memberships",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "memberships",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.memberships.create",
    "method": "POST",
    "path": "/organizations/{orgId}/teams/{teamId}/memberships",
    "required": [
      "orgId",
      "teamId",
      "userId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.event_types.list",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/event-types",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [],
    "result": "eventTypes",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "orgs.teams.event_types.all",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/event-types",
    "required": [
      "orgId"
    ],
    "query": [],
    "result": "eventTypes",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "orgs.teams.event_types.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/teams/{teamId}/event-types/{eventTypeId}",
    "required": [
      "orgId",
      "teamId",
      "eventTypeId"
    ],
    "query": [],
    "result": "eventType",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "orgs.teams.phone_calls.create",
    "method": "POST",
    "path": "/organizations/{orgId}/teams/{teamId}/event-types/{eventTypeId}/create-phone-call",
    "required": [
      "orgId",
      "teamId",
      "eventTypeId",
      "yourPhoneNumber",
      "numberToCall",
      "calApiKey",
      "enabled",
      "templateType"
    ],
    "query": [],
    "result": "phoneCall",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "orgs.schedules.list",
    "method": "GET",
    "path": "/organizations/{orgId}/schedules",
    "required": [
      "orgId"
    ],
    "query": [],
    "result": "schedules",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "orgs.users.schedules.list",
    "method": "GET",
    "path": "/organizations/{orgId}/users/{userId}/schedules",
    "required": [
      "orgId",
      "userId"
    ],
    "query": [],
    "result": "schedules",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "orgs.users.schedules.create",
    "method": "POST",
    "path": "/organizations/{orgId}/users/{userId}/schedules",
    "required": [
      "orgId",
      "userId",
      "name",
      "timeZone"
    ],
    "query": [],
    "result": "schedule",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "orgs.users.schedules.update",
    "method": "PATCH",
    "path": "/organizations/{orgId}/users/{userId}/schedules/{scheduleId}",
    "required": [
      "orgId",
      "userId",
      "scheduleId"
    ],
    "query": [],
    "result": "schedule",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "orgs.teams.users.schedules.list",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/users/{userId}/schedules",
    "required": [
      "orgId",
      "teamId",
      "userId"
    ],
    "query": [],
    "result": "schedules",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "orgs.teams.routing_forms.list",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/routing-forms",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [],
    "result": "routingForms",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.conferencing.default.get",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/conferencing/default",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [],
    "result": "app",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.stripe.check",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/stripe/check",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [],
    "result": "status",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.list",
    "method": "GET",
    "path": "/organizations/{orgId}/attributes",
    "required": [
      "orgId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "attributes",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.create",
    "method": "POST",
    "path": "/organizations/{orgId}/attributes",
    "required": [
      "orgId",
      "name",
      "slug",
      "type"
    ],
    "query": [],
    "result": "attribute",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.get",
    "method": "GET",
    "path": "/organizations/{orgId}/attributes/{attributeId}",
    "required": [
      "orgId",
      "attributeId"
    ],
    "query": [],
    "result": "attribute",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.update",
    "method": "PATCH",
    "path": "/organizations/{orgId}/attributes/{attributeId}",
    "required": [
      "orgId",
      "attributeId"
    ],
    "query": [],
    "result": "attribute",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/attributes/{attributeId}",
    "required": [
      "orgId",
      "attributeId"
    ],
    "query": [],
    "result": "attribute",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.options.list",
    "method": "GET",
    "path": "/organizations/{orgId}/attributes/{attributeId}/options",
    "required": [
      "orgId",
      "attributeId"
    ],
    "query": [],
    "result": "options",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.options.create",
    "method": "POST",
    "path": "/organizations/{orgId}/attributes/{attributeId}/options",
    "required": [
      "orgId",
      "attributeId",
      "value",
      "slug"
    ],
    "query": [],
    "result": "option",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.options.update",
    "method": "PATCH",
    "path": "/organizations/{orgId}/attributes/{attributeId}/options/{optionId}",
    "required": [
      "orgId",
      "attributeId",
      "optionId"
    ],
    "query": [],
    "result": "option",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.options.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/attributes/{attributeId}/options/{optionId}",
    "required": [
      "orgId",
      "attributeId",
      "optionId"
    ],
    "query": [],
    "result": "option",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.options.assigned",
    "method": "GET",
    "path": "/organizations/{orgId}/attributes/{attributeId}/options/assigned",
    "required": [
      "orgId",
      "attributeId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "assigned",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.options.assigned_by_slug",
    "method": "GET",
    "path": "/organizations/{orgId}/attributes/slugs/{attributeSlug}/options/assigned",
    "required": [
      "orgId",
      "attributeSlug"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "assigned",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.options.assign_user",
    "method": "POST",
    "path": "/organizations/{orgId}/attributes/options/{userId}",
    "required": [
      "orgId",
      "userId"
    ],
    "query": [],
    "result": "assignment",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.attributes.options.unassign_user",
    "method": "DELETE",
    "path": "/organizations/{orgId}/attributes/options/{userId}/{attributeOptionId}",
    "required": [
      "orgId",
      "userId",
      "attributeOptionId"
    ],
    "query": [],
    "result": "assignment",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.webhooks.list",
    "method": "GET",
    "path": "/organizations/{orgId}/webhooks",
    "required": [
      "orgId"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "webhooks",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.webhooks.create",
    "method": "POST",
    "path": "/organizations/{orgId}/webhooks",
    "required": [
      "orgId",
      "subscriberUrl",
      "triggers",
      "active"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.webhooks.get",
    "method": "GET",
    "path": "/organizations/{orgId}/webhooks/{webhookId}",
    "required": [
      "orgId",
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.webhooks.update",
    "method": "PATCH",
    "path": "/organizations/{orgId}/webhooks/{webhookId}",
    "required": [
      "orgId",
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.webhooks.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/webhooks/{webhookId}",
    "required": [
      "orgId",
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.workflows.list",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/workflows/routing-form",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [],
    "result": "workflows",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.workflows.create",
    "method": "POST",
    "path": "/organizations/{orgId}/teams/{teamId}/workflows/routing-form",
    "required": [
      "orgId",
      "teamId",
      "name"
    ],
    "query": [],
    "result": "workflow",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "oauth_clients.users.list",
    "method": "GET",
    "path": "/oauth-clients/{clientId}/users",
    "required": [
      "clientId",
      "xCalSecretKey"
    ],
    "query": [
      "take",
      "skip"
    ],
    "result": "users",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.users.create",
    "method": "POST",
    "path": "/oauth-clients/{clientId}/users",
    "required": [
      "clientId",
      "xCalSecretKey",
      "email",
      "name"
    ],
    "query": [],
    "result": "user",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.users.get",
    "method": "GET",
    "path": "/oauth-clients/{clientId}/users/{userId}",
    "required": [
      "clientId",
      "userId",
      "xCalSecretKey"
    ],
    "query": [],
    "result": "user",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.users.update",
    "method": "PATCH",
    "path": "/oauth-clients/{clientId}/users/{userId}",
    "required": [
      "clientId",
      "userId",
      "xCalSecretKey"
    ],
    "query": [],
    "result": "user",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.users.delete",
    "method": "DELETE",
    "path": "/oauth-clients/{clientId}/users/{userId}",
    "required": [
      "clientId",
      "userId",
      "xCalSecretKey"
    ],
    "query": [],
    "result": "user",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.users.force_refresh",
    "method": "POST",
    "path": "/oauth-clients/{clientId}/users/{userId}/force-refresh",
    "required": [
      "clientId",
      "userId",
      "xCalSecretKey"
    ],
    "query": [],
    "result": "tokens",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.tokens.refresh",
    "method": "POST",
    "path": "/oauth/{clientId}/refresh",
    "required": [
      "clientId"
    ],
    "query": [],
    "result": "tokens",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "oauth_clients.webhooks.create",
    "method": "POST",
    "path": "/oauth-clients/{clientId}/webhooks",
    "required": [
      "clientId",
      "xCalSecretKey",
      "subscriberUrl",
      "triggers",
      "active"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.webhooks.list",
    "method": "GET",
    "path": "/oauth-clients/{clientId}/webhooks",
    "required": [
      "clientId",
      "xCalSecretKey"
    ],
    "query": [],
    "result": "webhooks",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.webhooks.get",
    "method": "GET",
    "path": "/oauth-clients/{clientId}/webhooks/{webhookId}",
    "required": [
      "clientId",
      "webhookId",
      "xCalSecretKey"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.webhooks.update",
    "method": "PATCH",
    "path": "/oauth-clients/{clientId}/webhooks/{webhookId}",
    "required": [
      "clientId",
      "webhookId",
      "xCalSecretKey"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.webhooks.delete",
    "method": "DELETE",
    "path": "/oauth-clients/{clientId}/webhooks/{webhookId}",
    "required": [
      "clientId",
      "webhookId",
      "xCalSecretKey"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-08-13",
    "secret": true
  },
  {
    "op": "oauth_clients.get",
    "method": "GET",
    "path": "/oauth-clients/{clientId}",
    "required": [
      "clientId"
    ],
    "query": [],
    "result": "client",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "calendars.events.update",
    "method": "PATCH",
    "path": "/calendars/{calendar}/events/{eventUid}",
    "required": [
      "calendar",
      "eventUid"
    ],
    "query": [],
    "result": "event",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.update",
    "method": "PATCH",
    "path": "/bookings/{bookingUid}",
    "required": [
      "bookingUid"
    ],
    "query": [],
    "result": "booking",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "selected_calendars.get",
    "method": "GET",
    "path": "/selected-calendars/{userId}_{integration}_{externalId}",
    "required": [
      "userId",
      "integration",
      "externalId"
    ],
    "query": [],
    "result": "selectedCalendar",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "selected_calendars.update",
    "method": "PATCH",
    "path": "/selected-calendars/{userId}_{integration}_{externalId}",
    "required": [
      "userId",
      "integration",
      "externalId"
    ],
    "query": [],
    "result": "selectedCalendar",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.references.get",
    "method": "GET",
    "path": "/bookings/{bookingUid}/references/{id}",
    "required": [
      "bookingUid",
      "id"
    ],
    "query": [],
    "result": "reference",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "oauth2.token",
    "method": "POST",
    "path": "/auth/oauth2/token",
    "required": [
      "clientId"
    ],
    "query": [],
    "result": "tokens",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "bookings.attendees.update",
    "method": "PATCH",
    "path": "/bookings/{bookingUid}/attendees/{attendeeId}",
    "required": [
      "bookingUid",
      "attendeeId"
    ],
    "query": [],
    "result": "attendee",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "destination_calendars.delete",
    "method": "DELETE",
    "path": "/destination-calendars/{id}",
    "required": [
      "id"
    ],
    "query": [],
    "result": "destinationCalendar",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.event_types.create",
    "method": "POST",
    "path": "/organizations/{orgId}/teams/{teamId}/event-types",
    "required": [
      "orgId",
      "teamId",
      "title",
      "slug",
      "lengthInMinutes"
    ],
    "query": [],
    "result": "eventType",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "orgs.teams.stripe.connect",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/stripe/connect",
    "required": [
      "orgId",
      "teamId",
      "returnTo",
      "onErrorReturnTo"
    ],
    "query": [
      "returnTo",
      "onErrorReturnTo"
    ],
    "result": "url",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.event_types.private_links.list",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/event-types/{eventTypeId}/private-links",
    "required": [
      "orgId",
      "teamId",
      "eventTypeId"
    ],
    "query": [],
    "result": "privateLinks",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "orgs.teams.memberships.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/teams/{teamId}/memberships/{membershipId}",
    "required": [
      "orgId",
      "teamId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.users.schedules.delete",
    "method": "DELETE",
    "path": "/organizations/{orgId}/users/{userId}/schedules/{scheduleId}",
    "required": [
      "orgId",
      "userId",
      "scheduleId"
    ],
    "query": [],
    "result": "schedule",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "orgs.teams.event_types.get",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/event-types/{eventTypeId}",
    "required": [
      "orgId",
      "teamId",
      "eventTypeId"
    ],
    "query": [],
    "result": "eventType",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "orgs.users.schedules.get",
    "method": "GET",
    "path": "/organizations/{orgId}/users/{userId}/schedules/{scheduleId}",
    "required": [
      "orgId",
      "userId",
      "scheduleId"
    ],
    "query": [],
    "result": "schedule",
    "version": "2024-06-11",
    "secret": false
  },
  {
    "op": "event_types.webhooks.get",
    "method": "GET",
    "path": "/event-types/{eventTypeId}/webhooks/{webhookId}",
    "required": [
      "eventTypeId",
      "webhookId"
    ],
    "query": [],
    "result": "webhook",
    "version": "2024-06-14",
    "secret": false
  },
  {
    "op": "calendars.google.connect",
    "method": "GET",
    "path": "/calendars/google/connect",
    "required": [],
    "query": [
      "redir"
    ],
    "result": "url",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.bookings.references.list",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/bookings/{bookingUid}/references",
    "required": [
      "orgId",
      "teamId",
      "bookingUid"
    ],
    "query": [
      "type"
    ],
    "result": "references",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.memberships.update",
    "method": "PATCH",
    "path": "/organizations/{orgId}/teams/{teamId}/memberships/{membershipId}",
    "required": [
      "orgId",
      "teamId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.update",
    "method": "PATCH",
    "path": "/organizations/{orgId}/teams/{teamId}",
    "required": [
      "orgId",
      "teamId"
    ],
    "query": [],
    "result": "team",
    "version": "2024-08-13",
    "secret": false
  },
  {
    "op": "orgs.teams.memberships.get",
    "method": "GET",
    "path": "/organizations/{orgId}/teams/{teamId}/memberships/{membershipId}",
    "required": [
      "orgId",
      "teamId",
      "membershipId"
    ],
    "query": [],
    "result": "membership",
    "version": "2024-08-13",
    "secret": false
  }
];

const SPECS: Record<string, CalComExtendedSpec> = Object.fromEntries(CAL_COM_EXTENDED_SPECS.map((spec) => [spec.op, spec]));

function pick(input: Record<string, unknown>, key: string): unknown {
  if (input[key] !== undefined) return input[key];
  for (const alias of ALIASES[key] ?? []) {
    if (input[alias] !== undefined) return input[alias];
  }
  return undefined;
}

function present(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function asPathValue(value: unknown, field: string): string {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!text) throw new Error(`${field} is required`);
  if (text.includes("/") || text.includes("\\") || text.includes("..")) throw new Error(`${field} is invalid`);
  return text;
}

function isSuccessStatus(status: number): boolean {
  return status === 200 || status === 201 || status === 204;
}

function throwUpstream(status: number, headers: Record<string, string>, fallback: string): never {
  const rl = parseCalComRateLimit(status, headers);
  if (rl.limited) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Cal.com rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: fallback };
}

function usedKeysFor(spec: CalComExtendedSpec, input: Record<string, unknown>): Set<string> {
  const used = new Set<string>(["accessToken", "fetch"]);
  for (const match of spec.path.matchAll(/\{(\w+)\}/g)) {
    used.add(match[1]);
    for (const alias of ALIASES[match[1]] ?? []) used.add(alias);
  }
  for (const key of spec.query) {
    used.add(key);
    for (const alias of ALIASES[key] ?? []) used.add(alias);
  }
  if (spec.secret) {
    used.add("xCalSecretKey");
    used.add("x_cal_secret_key");
  }
  return used;
}

export function validateCalComExtendedInput(op: string, input: unknown): Record<string, unknown> {
  const spec = SPECS[op];
  if (!spec) throw new Error(`unknown cal-com operation ${op}`);
  if (!isRecord(input)) throw new Error(`${op} input must be an object`);
  const validated: Record<string, unknown> = {};
  for (const field of spec.required) {
    const value = pick(input, field);
    if (!present(value)) throw new Error(`${field} is required`);
    validated[field] = value;
  }
  for (const field of spec.query) {
    const value = pick(input, field);
    if (present(value)) validated[field] = value;
  }
  return validated;
}

export function runCalComExtended(op: string, input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const spec = SPECS[op];
  if (!spec) throw new Error(`unknown cal-com operation ${op}`);
  const validated = validateCalComExtendedInput(op, input);
  if (!isRecord(input) || typeof input.accessToken !== "string") {
    return { connector: "cal-com", action: op, source: "connector", validated };
  }

  let path = spec.path;
  for (const match of spec.path.matchAll(/\{(\w+)\}/g)) {
    const field = match[1];
    path = path.replace(`{${field}}`, encodeURIComponent(asPathValue(pick(input, field), field)));
  }

  const params = new URLSearchParams();
  for (const field of spec.query) {
    const value = pick(input, field);
    if (present(value)) params.set(field, String(value));
  }
  const query = params.toString();
  const urlPath = query ? `${path}?${query}` : path;

  const extraHeaders: Record<string, string> = {};
  if (spec.secret) {
    extraHeaders["x-cal-secret-key"] = String(pick(input, "xCalSecretKey"));
  }

  const used = usedKeysFor(spec, input);
  const body: Record<string, unknown> = {};
  if (spec.method === "POST" || spec.method === "PUT" || spec.method === "PATCH") {
    for (const [key, value] of Object.entries(input)) {
      if (RESERVED.has(key) || used.has(key) || value === undefined) continue;
      body[key] = value;
    }
  }
  const hasBody = (spec.method === "POST" || spec.method === "PUT" || spec.method === "PATCH") && Object.keys(body).length > 0;

  const client = createCalComClient({
    token: input.accessToken,
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    operation: op,
    calApiVersion: spec.version,
    extraHeaders,
  });

  const init: RequestInit = { method: spec.method };
  if (hasBody) init.body = JSON.stringify(body);

  return client.fetchJSON(urlPath, init, spec.version).then((response) => {
    if (!isSuccessStatus(response.status)) {
      throwUpstream(response.status, response.headers, `Cal.com rejected the ${op} request.`);
    }
    const data = unwrapEnvelope(response.body);
    return { connector: "cal-com", action: op, source: "connector", [spec.result]: data };
  });
}

export const calComExtendedHandlers: Record<string, (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>> = {};
for (const spec of CAL_COM_EXTENDED_SPECS) {
  calComExtendedHandlers[spec.op] = (input: unknown) => runCalComExtended(spec.op, input);
}
