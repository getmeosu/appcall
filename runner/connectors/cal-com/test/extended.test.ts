import { describe, expect, test } from "bun:test";
import { calComExtendedHandlers, CAL_COM_EXTENDED_SPECS, runCalComExtended, validateCalComExtendedInput } from "../src/extended-actions";
import ok from "../fixtures/extended_ok.json";

const CASES = [
  {
    "op": "me.update",
    "method": "PATCH",
    "path": "/v2/me",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "schedules.default.get",
    "method": "GET",
    "path": "/v2/schedules/default",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "bookings.attendees.list",
    "method": "GET",
    "path": "/v2/bookings/booking_uid_1/attendees",
    "input": {
      "bookingUid": "booking_uid_1"
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "bookings.attendees.add",
    "method": "POST",
    "path": "/v2/bookings/booking_uid_1/attendees",
    "input": {
      "bookingUid": "booking_uid_1",
      "name": "sample",
      "email": "ada@example.com",
      "timeZone": "America/New_York"
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "bookings.attendees.get",
    "method": "GET",
    "path": "/v2/bookings/booking_uid_1/attendees/9",
    "input": {
      "bookingUid": "booking_uid_1",
      "attendeeId": 9
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "bookings.references.list",
    "method": "GET",
    "path": "/v2/bookings/booking_uid_1/references",
    "input": {
      "bookingUid": "booking_uid_1"
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "bookings.mark_absent",
    "method": "POST",
    "path": "/v2/bookings/booking_uid_1/mark-absent",
    "input": {
      "bookingUid": "booking_uid_1"
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "bookings.reassign",
    "method": "POST",
    "path": "/v2/bookings/booking_uid_1/reassign/9",
    "input": {
      "bookingUid": "booking_uid_1",
      "userId": 9
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "bookings.reassign_auto",
    "method": "POST",
    "path": "/v2/bookings/booking_uid_1/reassign",
    "input": {
      "bookingUid": "booking_uid_1"
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "bookings.location.update",
    "method": "PATCH",
    "path": "/v2/bookings/booking_uid_1/location",
    "input": {
      "bookingUid": "booking_uid_1"
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "slots.reserve",
    "method": "POST",
    "path": "/v2/slots/reservations",
    "input": {
      "eventTypeId": 9,
      "slotStart": "2026-10-07T15:00:00Z"
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "slots.reservations.delete",
    "method": "DELETE",
    "path": "/v2/slots/reservations/booking_uid_1",
    "input": {
      "uid": "booking_uid_1"
    },
    "secret": false,
    "missing": "uid"
  },
  {
    "op": "calendars.list",
    "method": "GET",
    "path": "/v2/calendars",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "calendars.check",
    "method": "GET",
    "path": "/v2/calendars/google/check",
    "input": {
      "calendar": "google"
    },
    "secret": false,
    "missing": "calendar"
  },
  {
    "op": "calendars.google.check",
    "method": "GET",
    "path": "/v2/calendars/google/check",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "calendars.connect",
    "method": "GET",
    "path": "/v2/calendars/google/connect",
    "input": {
      "calendar": "google"
    },
    "secret": false,
    "missing": "calendar"
  },
  {
    "op": "calendars.ics.check",
    "method": "GET",
    "path": "/v2/calendars/ics-feed/check",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "calendars.ics.save",
    "method": "POST",
    "path": "/v2/calendars/ics-feed/save",
    "input": {
      "urls": [
        "https://example.com/cal.ics"
      ]
    },
    "secret": false,
    "missing": "urls"
  },
  {
    "op": "calendars.credentials.create",
    "method": "POST",
    "path": "/v2/calendars/google/credentials",
    "input": {
      "calendar": "google",
      "username": "sample",
      "password": "sample"
    },
    "secret": false,
    "missing": "calendar"
  },
  {
    "op": "calendars.save",
    "method": "GET",
    "path": "/v2/calendars/google/save",
    "input": {
      "calendar": "google",
      "state": "sample",
      "code": "sample"
    },
    "secret": false,
    "missing": "calendar"
  },
  {
    "op": "calendars.disconnect",
    "method": "POST",
    "path": "/v2/calendars/google/disconnect",
    "input": {
      "calendar": "google",
      "id": 9
    },
    "secret": false,
    "missing": "calendar"
  },
  {
    "op": "destination_calendars.update",
    "method": "PUT",
    "path": "/v2/destination-calendars",
    "input": {
      "integration": "google_calendar",
      "externalId": "primary"
    },
    "secret": false,
    "missing": "integration"
  },
  {
    "op": "selected_calendars.create",
    "method": "POST",
    "path": "/v2/selected-calendars",
    "input": {
      "integration": "google_calendar",
      "externalId": "primary",
      "credentialId": 9
    },
    "secret": false,
    "missing": "integration"
  },
  {
    "op": "selected_calendars.delete",
    "method": "DELETE",
    "path": "/v2/selected-calendars",
    "input": {
      "integration": "google_calendar",
      "externalId": "primary",
      "credentialId": 9
    },
    "secret": false,
    "missing": "integration"
  },
  {
    "op": "event_types.private_links.list",
    "method": "GET",
    "path": "/v2/event-types/9/private-links",
    "input": {
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "event_types.private_links.update",
    "method": "PATCH",
    "path": "/v2/event-types/9/private-links/attr_1",
    "input": {
      "eventTypeId": 9,
      "linkId": "attr_1"
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "event_types.webhooks.create",
    "method": "POST",
    "path": "/v2/event-types/9/webhooks",
    "input": {
      "eventTypeId": 9,
      "subscriberUrl": "https://hooks.example.com/cal",
      "triggers": [
        "BOOKING_CREATED"
      ],
      "active": true
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "event_types.webhooks.list",
    "method": "GET",
    "path": "/v2/event-types/9/webhooks",
    "input": {
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "event_types.webhooks.update",
    "method": "PATCH",
    "path": "/v2/event-types/9/webhooks/9",
    "input": {
      "eventTypeId": 9,
      "webhookId": 9
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "event_types.webhooks.delete",
    "method": "DELETE",
    "path": "/v2/event-types/9/webhooks/9",
    "input": {
      "eventTypeId": 9,
      "webhookId": 9
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "event_types.webhooks.delete_all",
    "method": "DELETE",
    "path": "/v2/event-types/9/webhooks",
    "input": {
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "webhooks.update",
    "method": "PATCH",
    "path": "/v2/webhooks/9",
    "input": {
      "webhookId": 9
    },
    "secret": false,
    "missing": "webhookId"
  },
  {
    "op": "teams.list",
    "method": "GET",
    "path": "/v2/teams",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "teams.get",
    "method": "GET",
    "path": "/v2/teams/9",
    "input": {
      "teamId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.create",
    "method": "POST",
    "path": "/v2/teams",
    "input": {
      "name": "sample"
    },
    "secret": false,
    "missing": "name"
  },
  {
    "op": "teams.update",
    "method": "PATCH",
    "path": "/v2/teams/9",
    "input": {
      "teamId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.delete",
    "method": "DELETE",
    "path": "/v2/teams/9",
    "input": {
      "teamId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.invite.create",
    "method": "POST",
    "path": "/v2/teams/9/invite",
    "input": {
      "teamId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.list",
    "method": "GET",
    "path": "/v2/teams/9/event-types",
    "input": {
      "teamId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.get",
    "method": "GET",
    "path": "/v2/teams/9/event-types/9",
    "input": {
      "teamId": 9,
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.create",
    "method": "POST",
    "path": "/v2/teams/9/event-types",
    "input": {
      "teamId": 9,
      "title": "sample",
      "slug": "sample",
      "lengthInMinutes": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.update",
    "method": "PATCH",
    "path": "/v2/teams/9/event-types/9",
    "input": {
      "teamId": 9,
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.delete",
    "method": "DELETE",
    "path": "/v2/teams/9/event-types/9",
    "input": {
      "teamId": 9,
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.bookings.list",
    "method": "GET",
    "path": "/v2/teams/9/bookings",
    "input": {
      "teamId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.schedules.list",
    "method": "GET",
    "path": "/v2/teams/9/schedules",
    "input": {
      "teamId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.memberships.list",
    "method": "GET",
    "path": "/v2/teams/9/memberships",
    "input": {
      "teamId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.memberships.get",
    "method": "GET",
    "path": "/v2/teams/9/memberships/9",
    "input": {
      "teamId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.memberships.create",
    "method": "POST",
    "path": "/v2/teams/9/memberships",
    "input": {
      "teamId": 9,
      "userId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.memberships.update",
    "method": "PATCH",
    "path": "/v2/teams/9/memberships/9",
    "input": {
      "teamId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.memberships.delete",
    "method": "DELETE",
    "path": "/v2/teams/9/memberships/9",
    "input": {
      "teamId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.webhooks.list",
    "method": "GET",
    "path": "/v2/teams/9/event-types/9/webhooks",
    "input": {
      "teamId": 9,
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.webhooks.get",
    "method": "GET",
    "path": "/v2/teams/9/event-types/9/webhooks/9",
    "input": {
      "teamId": 9,
      "eventTypeId": 9,
      "webhookId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.webhooks.update",
    "method": "PATCH",
    "path": "/v2/teams/9/event-types/9/webhooks/9",
    "input": {
      "teamId": 9,
      "eventTypeId": 9,
      "webhookId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.event_types.webhooks.delete_all",
    "method": "DELETE",
    "path": "/v2/teams/9/event-types/9/webhooks",
    "input": {
      "teamId": 9,
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "teams.phone_calls.create",
    "method": "POST",
    "path": "/v2/teams/9/event-types/9/create-phone-call",
    "input": {
      "teamId": 9,
      "eventTypeId": 9,
      "yourPhoneNumber": "+15555550100",
      "numberToCall": "+15555550100",
      "calApiKey": "secret",
      "enabled": true,
      "templateType": "CUSTOM_TEMPLATE"
    },
    "secret": false,
    "missing": "teamId"
  },
  {
    "op": "conferencing.list",
    "method": "GET",
    "path": "/v2/conferencing",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "conferencing.default.get",
    "method": "GET",
    "path": "/v2/conferencing/default",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "conferencing.default.set",
    "method": "POST",
    "path": "/v2/conferencing/zoom/default",
    "input": {
      "app": "zoom"
    },
    "secret": false,
    "missing": "app"
  },
  {
    "op": "conferencing.connect",
    "method": "POST",
    "path": "/v2/conferencing/zoom/connect",
    "input": {
      "app": "zoom"
    },
    "secret": false,
    "missing": "app"
  },
  {
    "op": "conferencing.oauth.auth_url",
    "method": "GET",
    "path": "/v2/conferencing/zoom/oauth/auth-url",
    "input": {
      "app": "zoom"
    },
    "secret": false,
    "missing": "app"
  },
  {
    "op": "conferencing.oauth.callback",
    "method": "GET",
    "path": "/v2/conferencing/zoom/oauth/callback",
    "input": {
      "app": "zoom"
    },
    "secret": false,
    "missing": "app"
  },
  {
    "op": "conferencing.disconnect",
    "method": "DELETE",
    "path": "/v2/conferencing/zoom/disconnect",
    "input": {
      "app": "zoom"
    },
    "secret": false,
    "missing": "app"
  },
  {
    "op": "stripe.check",
    "method": "GET",
    "path": "/v2/stripe/check",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "stripe.connect",
    "method": "GET",
    "path": "/v2/stripe/connect",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "stripe.save",
    "method": "GET",
    "path": "/v2/stripe/save",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "timezones.list",
    "method": "GET",
    "path": "/v2/timezones",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "verified_resources.phones.list",
    "method": "GET",
    "path": "/v2/verified-resources/phones",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "verified_resources.emails.request_code",
    "method": "POST",
    "path": "/v2/verified-resources/emails/verification-code/request",
    "input": {
      "email": "ada@example.com"
    },
    "secret": false,
    "missing": "email"
  },
  {
    "op": "orgs.memberships.list",
    "method": "GET",
    "path": "/v2/organizations/9/memberships",
    "input": {
      "orgId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.memberships.create",
    "method": "POST",
    "path": "/v2/organizations/9/memberships",
    "input": {
      "orgId": 9,
      "userId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.memberships.get",
    "method": "GET",
    "path": "/v2/organizations/9/memberships/9",
    "input": {
      "orgId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.memberships.update",
    "method": "PATCH",
    "path": "/v2/organizations/9/memberships/9",
    "input": {
      "orgId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.memberships.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/memberships/9",
    "input": {
      "orgId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.list",
    "method": "GET",
    "path": "/v2/organizations/9/users",
    "input": {
      "orgId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.create",
    "method": "POST",
    "path": "/v2/organizations/9/users",
    "input": {
      "orgId": 9,
      "email": "ada@example.com"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.update",
    "method": "PATCH",
    "path": "/v2/organizations/9/users/9",
    "input": {
      "orgId": 9,
      "userId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/users/9",
    "input": {
      "orgId": 9,
      "userId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.list",
    "method": "GET",
    "path": "/v2/organizations/9/teams",
    "input": {
      "orgId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.create",
    "method": "POST",
    "path": "/v2/organizations/9/teams",
    "input": {
      "orgId": 9,
      "name": "sample"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.me",
    "method": "GET",
    "path": "/v2/organizations/9/teams/me",
    "input": {
      "orgId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.get",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/teams/9",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.memberships.list",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/memberships",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.memberships.create",
    "method": "POST",
    "path": "/v2/organizations/9/teams/9/memberships",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "userId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.event_types.list",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/event-types",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.event_types.all",
    "method": "GET",
    "path": "/v2/organizations/9/teams/event-types",
    "input": {
      "orgId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.event_types.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/teams/9/event-types/9",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.phone_calls.create",
    "method": "POST",
    "path": "/v2/organizations/9/teams/9/event-types/9/create-phone-call",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "eventTypeId": 9,
      "yourPhoneNumber": "+15555550100",
      "numberToCall": "+15555550100",
      "calApiKey": "secret",
      "enabled": true,
      "templateType": "CUSTOM_TEMPLATE"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.schedules.list",
    "method": "GET",
    "path": "/v2/organizations/9/schedules",
    "input": {
      "orgId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.schedules.list",
    "method": "GET",
    "path": "/v2/organizations/9/users/9/schedules",
    "input": {
      "orgId": 9,
      "userId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.schedules.create",
    "method": "POST",
    "path": "/v2/organizations/9/users/9/schedules",
    "input": {
      "orgId": 9,
      "userId": 9,
      "name": "sample",
      "timeZone": "America/New_York"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.schedules.update",
    "method": "PATCH",
    "path": "/v2/organizations/9/users/9/schedules/9",
    "input": {
      "orgId": 9,
      "userId": 9,
      "scheduleId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.users.schedules.list",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/users/9/schedules",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "userId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.routing_forms.list",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/routing-forms",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.conferencing.default.get",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/conferencing/default",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.stripe.check",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/stripe/check",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.list",
    "method": "GET",
    "path": "/v2/organizations/9/attributes",
    "input": {
      "orgId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.create",
    "method": "POST",
    "path": "/v2/organizations/9/attributes",
    "input": {
      "orgId": 9,
      "name": "sample",
      "slug": "sample",
      "type": "sample"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.get",
    "method": "GET",
    "path": "/v2/organizations/9/attributes/attr_1",
    "input": {
      "orgId": 9,
      "attributeId": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.update",
    "method": "PATCH",
    "path": "/v2/organizations/9/attributes/attr_1",
    "input": {
      "orgId": 9,
      "attributeId": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/attributes/attr_1",
    "input": {
      "orgId": 9,
      "attributeId": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.options.list",
    "method": "GET",
    "path": "/v2/organizations/9/attributes/attr_1/options",
    "input": {
      "orgId": 9,
      "attributeId": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.options.create",
    "method": "POST",
    "path": "/v2/organizations/9/attributes/attr_1/options",
    "input": {
      "orgId": 9,
      "attributeId": "attr_1",
      "value": "sample",
      "slug": "sample"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.options.update",
    "method": "PATCH",
    "path": "/v2/organizations/9/attributes/attr_1/options/attr_1",
    "input": {
      "orgId": 9,
      "attributeId": "attr_1",
      "optionId": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.options.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/attributes/attr_1/options/attr_1",
    "input": {
      "orgId": 9,
      "attributeId": "attr_1",
      "optionId": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.options.assigned",
    "method": "GET",
    "path": "/v2/organizations/9/attributes/attr_1/options/assigned",
    "input": {
      "orgId": 9,
      "attributeId": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.options.assigned_by_slug",
    "method": "GET",
    "path": "/v2/organizations/9/attributes/slugs/attr_1/options/assigned",
    "input": {
      "orgId": 9,
      "attributeSlug": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.options.assign_user",
    "method": "POST",
    "path": "/v2/organizations/9/attributes/options/9",
    "input": {
      "orgId": 9,
      "userId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.attributes.options.unassign_user",
    "method": "DELETE",
    "path": "/v2/organizations/9/attributes/options/9/attr_1",
    "input": {
      "orgId": 9,
      "userId": 9,
      "attributeOptionId": "attr_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.webhooks.list",
    "method": "GET",
    "path": "/v2/organizations/9/webhooks",
    "input": {
      "orgId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.webhooks.create",
    "method": "POST",
    "path": "/v2/organizations/9/webhooks",
    "input": {
      "orgId": 9,
      "subscriberUrl": "https://hooks.example.com/cal",
      "triggers": [
        "BOOKING_CREATED"
      ],
      "active": true
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.webhooks.get",
    "method": "GET",
    "path": "/v2/organizations/9/webhooks/9",
    "input": {
      "orgId": 9,
      "webhookId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.webhooks.update",
    "method": "PATCH",
    "path": "/v2/organizations/9/webhooks/9",
    "input": {
      "orgId": 9,
      "webhookId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.webhooks.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/webhooks/9",
    "input": {
      "orgId": 9,
      "webhookId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.workflows.list",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/workflows/routing-form",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.workflows.create",
    "method": "POST",
    "path": "/v2/organizations/9/teams/9/workflows/routing-form",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "name": "sample"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "oauth_clients.users.list",
    "method": "GET",
    "path": "/v2/oauth-clients/client_abc/users",
    "input": {
      "clientId": "client_abc",
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.users.create",
    "method": "POST",
    "path": "/v2/oauth-clients/client_abc/users",
    "input": {
      "clientId": "client_abc",
      "xCalSecretKey": "secret",
      "email": "ada@example.com",
      "name": "sample"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.users.get",
    "method": "GET",
    "path": "/v2/oauth-clients/client_abc/users/9",
    "input": {
      "clientId": "client_abc",
      "userId": 9,
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.users.update",
    "method": "PATCH",
    "path": "/v2/oauth-clients/client_abc/users/9",
    "input": {
      "clientId": "client_abc",
      "userId": 9,
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.users.delete",
    "method": "DELETE",
    "path": "/v2/oauth-clients/client_abc/users/9",
    "input": {
      "clientId": "client_abc",
      "userId": 9,
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.users.force_refresh",
    "method": "POST",
    "path": "/v2/oauth-clients/client_abc/users/9/force-refresh",
    "input": {
      "clientId": "client_abc",
      "userId": 9,
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.tokens.refresh",
    "method": "POST",
    "path": "/v2/oauth/client_abc/refresh",
    "input": {
      "clientId": "client_abc"
    },
    "secret": false,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.webhooks.create",
    "method": "POST",
    "path": "/v2/oauth-clients/client_abc/webhooks",
    "input": {
      "clientId": "client_abc",
      "xCalSecretKey": "secret",
      "subscriberUrl": "https://hooks.example.com/cal",
      "triggers": [
        "BOOKING_CREATED"
      ],
      "active": true
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.webhooks.list",
    "method": "GET",
    "path": "/v2/oauth-clients/client_abc/webhooks",
    "input": {
      "clientId": "client_abc",
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.webhooks.get",
    "method": "GET",
    "path": "/v2/oauth-clients/client_abc/webhooks/9",
    "input": {
      "clientId": "client_abc",
      "webhookId": 9,
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.webhooks.update",
    "method": "PATCH",
    "path": "/v2/oauth-clients/client_abc/webhooks/9",
    "input": {
      "clientId": "client_abc",
      "webhookId": 9,
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.webhooks.delete",
    "method": "DELETE",
    "path": "/v2/oauth-clients/client_abc/webhooks/9",
    "input": {
      "clientId": "client_abc",
      "webhookId": 9,
      "xCalSecretKey": "secret"
    },
    "secret": true,
    "missing": "clientId"
  },
  {
    "op": "oauth_clients.get",
    "method": "GET",
    "path": "/v2/oauth-clients/client_abc",
    "input": {
      "clientId": "client_abc"
    },
    "secret": false,
    "missing": "clientId"
  },
  {
    "op": "calendars.events.update",
    "method": "PATCH",
    "path": "/v2/calendars/google/events/event_uid_1",
    "input": {
      "calendar": "google",
      "eventUid": "event_uid_1"
    },
    "secret": false,
    "missing": "calendar"
  },
  {
    "op": "bookings.update",
    "method": "PATCH",
    "path": "/v2/bookings/booking_uid_1",
    "input": {
      "bookingUid": "booking_uid_1"
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "selected_calendars.get",
    "method": "GET",
    "path": "/v2/selected-calendars/9_google_calendar_primary",
    "input": {
      "userId": 9,
      "integration": "google_calendar",
      "externalId": "primary"
    },
    "secret": false,
    "missing": "userId"
  },
  {
    "op": "selected_calendars.update",
    "method": "PATCH",
    "path": "/v2/selected-calendars/9_google_calendar_primary",
    "input": {
      "userId": 9,
      "integration": "google_calendar",
      "externalId": "primary"
    },
    "secret": false,
    "missing": "userId"
  },
  {
    "op": "bookings.references.get",
    "method": "GET",
    "path": "/v2/bookings/booking_uid_1/references/9",
    "input": {
      "bookingUid": "booking_uid_1",
      "id": 9
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "oauth2.token",
    "method": "POST",
    "path": "/v2/auth/oauth2/token",
    "input": {
      "clientId": "client_abc"
    },
    "secret": false,
    "missing": "clientId"
  },
  {
    "op": "bookings.attendees.update",
    "method": "PATCH",
    "path": "/v2/bookings/booking_uid_1/attendees/9",
    "input": {
      "bookingUid": "booking_uid_1",
      "attendeeId": 9
    },
    "secret": false,
    "missing": "bookingUid"
  },
  {
    "op": "destination_calendars.delete",
    "method": "DELETE",
    "path": "/v2/destination-calendars/9",
    "input": {
      "id": 9
    },
    "secret": false,
    "missing": "id"
  },
  {
    "op": "orgs.teams.event_types.create",
    "method": "POST",
    "path": "/v2/organizations/9/teams/9/event-types",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "title": "sample",
      "slug": "sample",
      "lengthInMinutes": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.stripe.connect",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/stripe/connect",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "returnTo": "sample",
      "onErrorReturnTo": "sample"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.event_types.private_links.list",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/event-types/9/private-links",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.memberships.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/teams/9/memberships/9",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.schedules.delete",
    "method": "DELETE",
    "path": "/v2/organizations/9/users/9/schedules/9",
    "input": {
      "orgId": 9,
      "userId": 9,
      "scheduleId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.event_types.get",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/event-types/9",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "eventTypeId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.users.schedules.get",
    "method": "GET",
    "path": "/v2/organizations/9/users/9/schedules/9",
    "input": {
      "orgId": 9,
      "userId": 9,
      "scheduleId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "event_types.webhooks.get",
    "method": "GET",
    "path": "/v2/event-types/9/webhooks/9",
    "input": {
      "eventTypeId": 9,
      "webhookId": 9
    },
    "secret": false,
    "missing": "eventTypeId"
  },
  {
    "op": "calendars.google.connect",
    "method": "GET",
    "path": "/v2/calendars/google/connect",
    "input": {},
    "secret": false,
    "missing": null
  },
  {
    "op": "orgs.teams.bookings.references.list",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/bookings/booking_uid_1/references",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "bookingUid": "booking_uid_1"
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.memberships.update",
    "method": "PATCH",
    "path": "/v2/organizations/9/teams/9/memberships/9",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.update",
    "method": "PATCH",
    "path": "/v2/organizations/9/teams/9",
    "input": {
      "orgId": 9,
      "teamId": 9
    },
    "secret": false,
    "missing": "orgId"
  },
  {
    "op": "orgs.teams.memberships.get",
    "method": "GET",
    "path": "/v2/organizations/9/teams/9/memberships/9",
    "input": {
      "orgId": 9,
      "teamId": 9,
      "membershipId": 9
    },
    "secret": false,
    "missing": "orgId"
  }
] as const;

function mockFetch(status = 200, body: unknown = ok, headers: Record<string, string> = {}) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { requests, fetch };
}

describe("cal-com extended specs", () => {
  test("every spec has a handler and unique op name", () => {
    const names = CAL_COM_EXTENDED_SPECS.map((spec) => spec.op);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(calComExtendedHandlers).sort()).toEqual([...names].sort());
  });
});

describe("cal-com extended operations", () => {
  for (const cse of CASES) {
    test(`${cse.op} validates without accessToken and calls ${cse.method} ${cse.path}`, async () => {
      const dry = runCalComExtended(cse.op, cse.input);
      expect(dry).toMatchObject({ connector: "cal-com", action: cse.op, source: "connector" });
      const { requests, fetch } = mockFetch();
      const live = await runCalComExtended(cse.op, { ...cse.input, accessToken: "cal_live_test", fetch });
      expect(requests).toHaveLength(1);
      const url = new URL(requests[0].url);
      expect(url.origin + url.pathname).toBe("https://api.cal.com" + cse.path);
      expect(requests[0].method).toBe(cse.method);
      expect(requests[0].headers.get("Authorization")).toBe("Bearer cal_live_test");
      if (cse.secret) {
        expect(requests[0].headers.get("x-cal-secret-key")).toBe("secret");
      }
      expect(live.action).toBe(cse.op);
      expect(live.source).toBe("connector");
    });
  }

  test("rejects missing required fields before fetch", () => {
    expect(() => validateCalComExtendedInput("teams.get", {})).toThrow("teamId is required");
    expect(() => validateCalComExtendedInput("bookings.attendees.add", { bookingUid: "x" })).toThrow("name is required");
  });

  test("accepts Composio bookingId alias for bookingUid", async () => {
    const { requests, fetch } = mockFetch();
    await runCalComExtended("bookings.attendees.list", { accessToken: "k", bookingId: 44, fetch });
    expect(requests[0].url).toBe("https://api.cal.com/v2/bookings/44/attendees");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(runCalComExtended("teams.list", {
      accessToken: "k",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR without leaking bodies", async () => {
    await expect(runCalComExtended("teams.list", {
      accessToken: "k",
      fetch: async () => new Response(JSON.stringify({ secret: "never" }), { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("rejects path traversal in identifiers", () => {
    expect(() => validateCalComExtendedInput("teams.get", { teamId: "../etc" })).not.toThrow();
    expect(() => runCalComExtended("teams.get", { accessToken: "k", teamId: "../etc", fetch: async () => new Response("{}") })).toThrow("teamId is invalid");
  });
});
