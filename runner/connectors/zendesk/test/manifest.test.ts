import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { zendeskActions } from "../src/actions";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const PATHS = {
  "healthcheck": "/users/me",
  "macros.list": "/macros",
  "organizations.create": "/organizations",
  "organizations.delete": "/organizations/{{organization_id}}",
  "organizations.get": "/organizations/{{organization_id}}",
  "organizations.list": "/organizations",
  "organizations.search": "/organizations/search",
  "organizations.update": "/organizations/{{organization_id}}",
  "requests.create": "/requests",
  "requests.get": "/requests/{{request_id}}",
  "requests.list": "/requests",
  "search": "/search",
  "search.count": "/search/count",
  "ticket_fields.list": "/ticket_fields",
  "tickets.comments.list": "/tickets/{{ticket_id}}/comments",
  "tickets.count": "/tickets/count",
  "tickets.create": "/tickets",
  "tickets.delete": "/tickets/{{ticket_id}}",
  "tickets.get": "/tickets/{{ticket_id}}",
  "tickets.list": "/tickets",
  "tickets.merge": "/tickets/{{target_ticket_id}}/merge",
  "tickets.recent": "/tickets/recent",
  "tickets.related": "/tickets/{{ticket_id}}/related",
  "tickets.reply": "/tickets/{{ticket_id}}",
  "tickets.show_many": "/tickets/show_many",
  "tickets.update": "/tickets/{{ticket_id}}",
  "users.count": "/users/count",
  "users.create": "/users",
  "users.delete": "/users/{{user_id}}",
  "users.get": "/users/{{user_id}}",
  "users.list": "/users",
  "users.me": "/users/me",
  "users.search": "/users/search",
  "users.show_many": "/users/show_many",
  "users.update": "/users/{{user_id}}",
  "views.execute": "/views/{{view_id}}/execute",
  "views.list": "/views",
  "macros.apply_to_ticket": "/tickets/{{ticket_id}}/macros/{{macro_id}}/apply",
  "problems.autocomplete": "/problems/autocomplete",
  "users.autocomplete": "/users/autocomplete",
  "brands.host_mapping.check": "/brands/{{brand_id}}/check_host_mapping",
  "deleted_users.count": "/deleted_users/count",
  "users.ccd_tickets.count": "/users/{{user_id}}/tickets/ccd/count",
  "custom_objects.records.count": "/custom_objects/{{custom_object_key}}/records/count",
  "organizations.count": "/organizations/count",
  "custom_objects.access_rules.create": "/custom_objects/{{custom_object_key}}/access_rules",
  "apps.installations.create": "/apps/installations",
  "apps.notify": "/apps/notify",
  "tags.autocomplete": "/autocomplete/tags",
  "automations.create": "/automations",
  "bookmarks.create": "/bookmarks",
  "tickets.comments.redact": "/tickets/{{ticket_id}}/comments/{{ticket_comment_id}}/redact",
  "custom_objects.jobs.create": "/custom_objects/{{custom_object_key}}/jobs",
  "custom_objects.records.create": "/custom_objects/{{custom_object_key}}/records",
  "custom_statuses.create": "/custom_statuses",
  "deletion_schedules.create": "/deletion_schedules",
  "dynamic_content.create": "/dynamic_content/items",
  "dynamic_content.variants.create": "/dynamic_content/items/{{dynamic_content_item_id}}/variants",
  "end_users.identities.create": "/end_users/{{user_id}}/identities",
  "group_memberships.create": "/group_memberships",
  "tickets.import_many": "/imports/tickets/create_many",
  "dynamic_content.variants.create_many": "/dynamic_content/items/{{dynamic_content_item_id}}/variants/create_many",
  "tickets.create_many": "/tickets/create_many",
  "users.create_many": "/users/create_many",
  "object_triggers.create": "/custom_objects/{{custom_object_key}}/triggers",
  "organization_fields.create": "/organization_fields",
  "organization_memberships.create": "/organization_memberships",
  "organization_memberships.create_many": "/organization_memberships/create_many",
  "organizations.merge": "/organizations/{{organization_id}}/merge",
  "organizations.tags.create": "/organizations/{{organization_id}}/tags",
  "organization_subscriptions.create": "/organization_subscriptions",
  "users.create_or_update_many": "/users/create_or_update_many",
  "organizations.create_or_update": "/organizations/create_or_update",
  "users.create_or_update": "/users/create_or_update",
  "push_notification_devices.destroy_many": "/push_notification_devices/destroy_many",
  "resource_collections.create": "/resource_collections",
  "side_conversations.create": "/tickets/{{ticket_id}}/side_conversations",
  "recipient_addresses.create": "/recipient_addresses",
  "suspended_tickets.export": "/suspended_tickets/export",
  "tickets.content_pins.create": "/tickets/{{ticket_id}}/content_pins",
  "ticket_fields.create": "/ticket_fields",
  "ticket_fields.options.create": "/ticket_fields/{{ticket_field_id}}/options",
  "triggers.create": "/triggers",
  "trigger_categories.jobs.create": "/trigger_categories/jobs",
  "trigger_categories.create": "/trigger_categories",
  "user_fields.options.create": "/user_fields/{{user_field_id}}/options",
  "users.identities.create": "/users/{{user_id}}/identities",
  "user_profiles.events.create": "/user_profiles/events",
  "users.logout_many": "/users/logout_many",
  "users.organization_memberships.create": "/users/{{user_id}}/organization_memberships",
  "users.tags.create": "/users/{{user_id}}/tags",
  "views.create": "/views",
  "views.preview": "/views/preview",
  "views.preview_count": "/views/preview/count",
  "custom_objects.create": "/custom_objects",
  "custom_objects.fields.create": "/custom_objects/{{custom_object_key}}/fields",
  "groups.create": "/groups",
  "tickets.import": "/imports/tickets",
  "targets.create": "/targets",
  "channels.voice.tickets.create": "/channels/voice/tickets",
  "user_fields.create": "/user_fields",
  "custom_objects.access_rules.delete": "/custom_objects/{{custom_object_key}}/access_rules/{{id}}",
  "automations.delete": "/automations/{{automation_id}}",
  "business_hours.schedules.delete": "/business_hours/schedules/{{schedule_id}}",
  "custom_objects.records.attachments.delete": "/custom_objects/{{custom_object_key}}/records/{{record_id}}/attachments/{{id}}",
  "custom_objects.records.delete_by_external_id_or_name": "/custom_objects/{{custom_object_key}}/records",
  "deleted_tickets.delete": "/deleted_tickets/{{ticket_id}}",
  "deletion_schedules.delete": "/deletion_schedules/{{deletion_schedule_id}}",
  "group_memberships.delete": "/group_memberships/{{group_membership_id}}",
  "group_memberships.destroy_many": "/group_memberships/destroy_many",
  "macros.delete": "/macros/{{macro_id}}",
  "macros.destroy_many": "/macros/destroy_many",
  "automations.destroy_many": "/automations/destroy_many",
  "object_triggers.destroy_many": "/custom_objects/{{custom_object_key}}/triggers/destroy_many",
  "organization_memberships.destroy_many": "/organization_memberships/destroy_many",
  "views.destroy_many": "/views/destroy_many",
  "organization_fields.delete": "/organization_fields/{{organization_field_id}}",
  "organization_memberships.delete": "/organization_memberships/{{organization_membership_id}}",
  "organization_subscriptions.delete": "/organization_subscriptions/{{organization_subscription_id}}",
  "resource_collections.delete": "/resource_collections/{{resource_collection_id}}",
  "suspended_tickets.destroy_many": "/suspended_tickets/destroy_many",
  "targets.delete": "/targets/{{target_id}}",
  "ticket_fields.delete": "/ticket_fields/{{ticket_field_id}}",
  "ticket_fields.options.delete": "/ticket_fields/{{ticket_field_id}}/options/{{ticket_field_option_id}}",
  "triggers.delete": "/triggers/{{trigger_id}}",
  "trigger_categories.delete": "/trigger_categories/{{trigger_category_id}}",
  "user_fields.delete": "/user_fields/{{user_field_id}}",
  "user_fields.options.delete": "/user_fields/{{user_field_id}}/options/{{user_field_option_id}}",
  "deleted_users.delete": "/deleted_users/{{deleted_user_id}}",
  "user_profiles.delete": "/user_profiles/{{profile_id}}",
  "users.destroy_many": "/users/destroy_many",
  "users.sessions.delete": "/users/{{user_id}}/sessions/{{session_id}}",
  "users.group_memberships.delete": "/users/{{user_id}}/group_memberships/{{group_membership_id}}",
  "users.identities.delete": "/users/{{user_id}}/identities/{{user_identity_id}}",
  "users.me.logout": "/users/me/logout",
  "users.organization_memberships.delete": "/users/{{user_id}}/organization_memberships/{{organization_membership_id}}",
  "users.sessions.delete_all": "/users/{{user_id}}/sessions",
  "views.delete": "/views/{{view_id}}",
  "apps.installations.delete": "/apps/installations/{{app_installation_id}}",
  "bookmarks.delete": "/bookmarks/{{bookmark_id}}",
  "custom_objects.delete": "/custom_objects/{{custom_object_key}}",
  "custom_objects.fields.delete": "/custom_objects/{{custom_object_key}}/fields/{{custom_object_field_key_or_id}}",
  "custom_objects.records.delete": "/custom_objects/{{custom_object_key}}/records/{{custom_object_record_id}}",
  "custom_statuses.delete": "/custom_statuses/{{custom_status_id}}",
  "dynamic_content.delete": "/dynamic_content/items/{{dynamic_content_item_id}}",
  "dynamic_content.variants.delete": "/dynamic_content/items/{{dynamic_content_item_id}}/variants/{{dynamic_content_variant_id}}",
  "object_triggers.delete": "/custom_objects/{{custom_object_key}}/triggers/{{trigger_id}}",
  "recipient_addresses.delete": "/recipient_addresses/{{support_address_id}}",
  "deleted_tickets.destroy_many": "/deleted_tickets/destroy_many",
  "organizations.destroy_many": "/organizations/destroy_many",
  "locales.detect_best": "/locales/detect_best_locale",
  "account.settings.get": "/account/settings",
  "triggers.list_active": "/triggers/active",
  "activities.count": "/activities/count",
  "apps.get": "/apps/{{app_id}}",
  "apps.installations.requirements": "/apps/installations/{{app_installation_id}}/requirements",
  "apps.locations.get": "/apps/locations/{{app_location_id}}",
  "apps.location_installations.list": "/apps/location_installations",
  "apps.public_key.get": "/apps/public_key",
  "attachments.get": "/attachments/{{attachment_id}}",
  "tags.autocomplete_get": "/autocomplete/tags",
  "automations.get": "/automations/{{automation_id}}",
  "automations.list": "/automations",
  "automations.search": "/automations/search",
  "brands.list": "/brands",
  "brands.get": "/brands/{{brand_id}}",
  "brands.agents.list": "/brands/{{brand_id}}/agents",
  "custom_objects.fields.limit": "/custom_objects/limits/object_fields",
  "custom_objects.records.limit": "/custom_objects/limits/records",
  "custom_objects.limit": "/custom_objects/limits/objects",
  "custom_statuses.get": "/custom_statuses/{{custom_status_id}}",
  "custom_statuses.list": "/custom_statuses",
  "deleted_tickets.list": "/deleted_tickets",
  "deleted_users.get": "/deleted_users/{{deleted_user_id}}",
  "deletion_schedules.get": "/deletion_schedules/{{deletion_schedule_id}}",
  "deletion_schedules.list": "/deletion_schedules",
  "dynamic_content.list": "/dynamic_content/items",
  "dynamic_content.get": "/dynamic_content/items/{{dynamic_content_item_id}}",
  "dynamic_content.show_many": "/dynamic_content/items/show_many",
  "dynamic_content.variants.list": "/dynamic_content/items/{{dynamic_content_item_id}}/variants",
  "dynamic_content.variants.get": "/dynamic_content/items/{{dynamic_content_item_id}}/variants/{{dynamic_content_variant_id}}",
  "email_notifications.get": "/email_notifications/{{notification_id}}",
  "email_notifications.list": "/email_notifications",
  "email_notifications.show_many": "/email_notifications/show_many",
  "end_users.identities.list": "/end_users/{{user_id}}/identities",
  "end_users.identities.get": "/end_users/{{user_id}}/identities/{{user_identity_id}}",
  "group_memberships.get": "/group_memberships/{{group_membership_id}}",
  "group_memberships.list": "/group_memberships",
  "groups.memberships.list": "/groups/{{group_id}}/memberships",
  "groups.list_assignable": "/groups/assignable",
  "groups.count": "/groups/count",
  "groups.users.count": "/groups/{{group_id}}/users/count",
  "groups.users.list": "/groups/{{group_id}}/users",
  "guide.survey_responses.list": "/guide/csat_survey_responses",
  "guide.surveys.list": "/guide/csat_surveys",
  "incremental.organizations": "/incremental/organizations",
  "incremental.routing.attributes": "/incremental/routing/attributes",
  "incremental.routing.attribute_values": "/incremental/routing/attribute_values",
  "incremental.routing.instance_values": "/incremental/routing/instance_values",
  "incremental.tickets.sample": "/incremental/tickets/sample",
  "incremental.ticket_events": "/incremental/ticket_events",
  "incremental.ticket_metric_events": "/incremental/ticket_metric_events",
  "incremental.tickets": "/incremental/tickets",
  "incremental.tickets.cursor": "/incremental/tickets/cursor",
  "incremental.users": "/incremental/users",
  "incremental.users.cursor": "/incremental/users/cursor",
  "job_statuses.list": "/job_statuses",
  "job_statuses.get": "/job_statuses/{{job_status_id}}",
  "locales.get": "/locales/{{locale_id}}",
  "locales.list": "/locales",
  "locales.agent": "/locales/agent",
  "locales.current": "/locales/current",
  "macros.get": "/macros/{{macro_id}}",
  "macros.attachments.list": "/macros/{{macro_id}}/attachments",
  "macros.categories.list": "/macros/categories",
  "macros.definitions": "/macros/definitions",
  "macros.replica": "/macros/{{macro_id}}/new",
  "macros.actions": "/macros/actions",
  "macros.list_active": "/macros/active",
  "macros.apply": "/macros/{{macro_id}}/apply",
  "macros.search": "/macros/search",
  "object_triggers.get": "/custom_objects/{{custom_object_key}}/triggers/{{trigger_id}}",
  "requests.list_open": "/requests/open",
  "organization_fields.get": "/organization_fields/{{organization_field_id}}",
  "organization_fields.list": "/organization_fields",
  "organization_memberships.get": "/organization_memberships/{{organization_membership_id}}",
  "organizations.related": "/organizations/{{organization_id}}/related",
  "organizations.requests.list": "/organizations/{{organization_id}}/requests",
  "organizations.autocomplete": "/organizations/autocomplete",
  "organizations.merges.list": "/organizations/{{organization_id}}/merges",
  "organizations.show_many": "/organizations/show_many",
  "organizations.tickets.count": "/organizations/{{organization_id}}/tickets/count",
  "organization_subscriptions.get": "/organization_subscriptions/{{organization_subscription_id}}",
  "organization_subscriptions.list": "/organization_subscriptions",
  "organizations.tags.list": "/organizations/{{organization_id}}/tags",
  "organizations.tickets.list": "/organizations/{{organization_id}}/tickets",
  "organizations.users.list": "/organizations/{{organization_id}}/users",
  "organizations.users.count": "/organizations/{{organization_id}}/users/count",
  "apps.owned.list": "/apps/owned",
  "problems.list": "/problems",
  "locales.public": "/locales/public",
  "account.remote_authentications": "/account/settings/remote_authentications",
  "requests.comments.list": "/requests/{{request_id}}/comments",
  "requests.list_ccd": "/requests/ccd",
  "requests.comments.get": "/requests/{{request_id}}/comments/{{ticket_comment_id}}",
  "requests.search": "/requests/search",
  "requests.list_solved": "/requests/solved",
  "routing.agents.instance_values": "/routing/agents/instance_values",
  "satisfaction_ratings.list": "/satisfaction_ratings",
  "satisfaction_ratings.count": "/satisfaction_ratings/count",
  "search.export": "/search/export",
  "account.security_settings": "/account/settings/security",
  "side_conversations.events.list": "/side_conversations/events",
  "recipient_addresses.get": "/recipient_addresses/{{support_address_id}}",
  "tags.list": "/tags",
  "tags.count": "/tags/count",
  "targets.get": "/targets/{{target_id}}",
  "target_failures.get": "/target_failures/{{target_failure_id}}",
  "target_failures.list": "/target_failures",
  "targets.list": "/targets",
  "tickets.audits.get": "/tickets/{{ticket_id}}/audits/{{ticket_audit_id}}",
  "tickets.collaborators.list": "/tickets/{{ticket_id}}/collaborators",
  "tickets.email_ccs.list": "/tickets/{{ticket_id}}/email_ccs",
  "ticket_fields.get": "/ticket_fields/{{ticket_field_id}}",
  "ticket_fields.count": "/ticket_fields/count",
  "ticket_fields.show_many": "/ticket_fields/show_many",
  "tickets.followers.list": "/tickets/{{ticket_id}}/followers",
  "ticket_forms.list": "/ticket_forms",
  "ticket_forms.show_many": "/ticket_forms/show_many",
  "tickets.incidents.list": "/tickets/{{ticket_id}}/incidents",
  "ticket_metrics.get": "/ticket_metrics/{{ticket_metric_id}}",
  "ticket_metrics.list": "/ticket_metrics",
  "tickets.audits.list": "/tickets/{{ticket_id}}/audits",
  "tickets.audits.count": "/tickets/{{ticket_id}}/audits/count",
  "tickets.comments.count": "/tickets/{{ticket_id}}/comments/count",
  "tickets.conversation_log.get": "/tickets/{{ticket_id}}/conversation_log",
  "tickets.skips.list": "/tickets/{{ticket_id}}/skips",
  "tickets.sla_policy_metrics.get": "/tickets/{{ticket_id}}/slas",
  "tickets.metrics.get": "/tickets/{{ticket_id}}/metrics",
  "tickets.side_conversations.events": "/tickets/{{ticket_id}}/side_conversations/events",
  "triggers.get": "/triggers/{{trigger_id}}",
  "trigger_categories.list": "/trigger_categories",
  "trigger_categories.get": "/trigger_categories/{{trigger_category_id}}",
  "triggers.list": "/triggers",
  "triggers.definitions": "/triggers/definitions",
  "triggers.search": "/triggers/search",
  "users.entitlements.get": "/users/{{user_id}}/entitlements",
  "users.events.list": "/users/{{user_id}}/events",
  "user_fields.get": "/user_fields/{{user_field_id}}",
  "user_fields.options.list": "/user_fields/{{user_field_id}}/options",
  "user_fields.list": "/user_fields",
  "user_fields.show_many": "/user_fields/show_many",
  "user_profiles.get": "/user_profiles/{{profile_id}}",
  "user_profiles.events.list": "/user_profiles/{{profile_id}}/events",
  "users.assigned_tickets.list": "/users/{{user_id}}/tickets/assigned",
  "users.autocomplete_get": "/users/autocomplete",
  "users.brand_agents.list": "/users/{{user_id}}/brand_agents",
  "users.ccd_tickets.list": "/users/{{user_id}}/tickets/ccd",
  "users.compliance_deletion_statuses": "/users/{{user_id}}/compliance_deletion_statuses",
  "users.sessions.list": "/users/{{user_id}}/sessions",
  "users.followed_tickets.list": "/users/{{user_id}}/tickets/followed",
  "users.group_memberships.list": "/users/{{user_id}}/group_memberships",
  "users.group_memberships.get": "/users/{{user_id}}/group_memberships/{{group_membership_id}}",
  "users.groups.list": "/users/{{user_id}}/groups",
  "users.groups.count": "/users/{{user_id}}/groups/count",
  "users.identities.get": "/users/{{user_id}}/identities/{{user_identity_id}}",
  "users.me.session": "/users/me/session",
  "users.me.settings.get": "/users/me/settings",
  "users.organization_memberships.list": "/users/{{user_id}}/organization_memberships",
  "users.organization_memberships.get": "/users/{{user_id}}/organization_memberships/{{organization_membership_id}}",
  "users.organizations.list": "/users/{{user_id}}/organizations",
  "users.organizations.count": "/users/{{user_id}}/organizations/count",
  "users.organization_subscriptions.list": "/users/{{user_id}}/organization_subscriptions",
  "users.password_requirements": "/users/{{user_id}}/password/requirements",
  "users.profiles.list": "/users/{{user_id}}/profiles",
  "users.related": "/users/{{user_id}}/related",
  "users.requested_tickets.list": "/users/{{user_id}}/tickets/requested",
  "users.requests.list": "/users/{{user_id}}/requests",
  "users.skips.list": "/users/{{user_id}}/skips",
  "users.tags.list": "/users/{{user_id}}/tags",
  "users.assigned_tickets.count": "/users/{{user_id}}/tickets/assigned/count",
  "views.definitions": "/views/definitions",
  "views.list_active": "/views/active",
  "views.compact": "/views/compact",
  "views.count": "/views/count",
  "views.count_many": "/views/count_many",
  "views.export": "/views/{{view_id}}/export",
  "views.search": "/views/search",
  "views.show_many": "/views/show_many",
  "views.tickets.list": "/views/{{view_id}}/tickets",
  "views.tickets.count": "/views/{{view_id}}/tickets/count",
  "activities.list": "/activities",
  "custom_roles.list": "/custom_roles",
  "organizations.merges.get": "/organization_merges/{{organization_merge_id}}",
  "organizations.subscriptions.list": "/organizations/{{organization_id}}/organization_subscriptions",
  "sessions.list": "/sessions",
  "sharing_agreements.list": "/sharing_agreements",
  "suspended_tickets.list": "/suspended_tickets",
  "ticket_fields.options.list": "/ticket_fields/{{ticket_field_id}}/options",
  "ticket_fields.options.get": "/ticket_fields/{{ticket_field_id}}/options/{{ticket_field_option_id}}",
  "ticket_forms.get": "/ticket_forms/{{ticket_form_id}}",
  "side_conversations.get": "/tickets/{{ticket_id}}/side_conversations/{{side_conversation_id}}",
  "tickets.tags.list": "/tickets/{{ticket_id}}/tags",
  "automations.list_active": "/automations/active",
  "apps.installations.list": "/apps/installations",
  "apps.locations.list": "/apps/locations",
  "group_memberships.list_assignable": "/group_memberships/assignable",
  "groups.memberships.list_assignable": "/groups/{{group_id}}/memberships/assignable",
  "bookmarks.list": "/bookmarks",
  "brand_agents.list": "/brand_agents",
  "custom_objects.records.attachments.list": "/custom_objects/{{custom_object_key}}/records/{{record_id}}/attachments",
  "custom_objects.records.list": "/custom_objects/{{custom_object_key}}/records",
  "deleted_users.list": "/deleted_users",
  "help_center.articles.list": "/help_center/articles",
  "incremental.custom_object_records": "/incremental/custom_objects/{{custom_object_key}}/records",
  "channels.twitter.monitored_handles": "/channels/twitter/monitored_twitter_handles",
  "object_triggers.list": "/custom_objects/{{custom_object_key}}/triggers",
  "object_triggers.definitions": "/custom_objects/{{custom_object_key}}/triggers/definitions",
  "organization_memberships.list": "/organization_memberships",
  "organizations.memberships.list": "/organizations/{{organization_id}}/organization_memberships",
  "resource_collections.list": "/resource_collections",
  "skips.list": "/skips",
  "recipient_addresses.list": "/recipient_addresses",
  "ticket_audits.list": "/ticket_audits",
  "tickets.content_pins.list": "/tickets/{{ticket_id}}/content_pins",
  "users.identities.list": "/users/{{user_id}}/identities",
  "custom_objects.access_rules.list": "/custom_objects/{{custom_object_key}}/access_rules",
  "custom_objects.fields.list": "/custom_objects/{{custom_object_key}}/fields",
  "custom_objects.list": "/custom_objects",
  "custom_objects.permission_policies.list": "/custom_objects/{{custom_object_key}}/permission_policies",
  "tickets.comments.make_private": "/tickets/{{ticket_id}}/comments/{{ticket_comment_id}}/make_private",
  "users.organization_memberships.make_default": "/users/{{user_id}}/organization_memberships/{{organization_membership_id}}/make_default",
  "end_users.identities.make_primary": "/end_users/{{user_id}}/identities/{{user_identity_id}}/make_primary",
  "tickets.audits.make_private": "/tickets/{{ticket_id}}/audits/{{ticket_audit_id}}/make_private",
  "users.identities.make_primary": "/users/{{user_id}}/identities/{{user_identity_id}}/make_primary",
  "tickets.mark_many_as_spam": "/tickets/mark_many_as_spam",
  "users.merge": "/users/{{user_id}}/merge",
  "users.open": "/users/{{user_id}}/open",
  "suspended_tickets.recover_many": "/suspended_tickets/recover_many",
  "users.me.session.renew": "/users/me/session/renew",
  "custom_objects.fields.reorder": "/custom_objects/{{custom_object_key}}/fields/reorder",
  "apps.location_installations.reorder": "/apps/location_installations/reorder",
  "organization_fields.reorder": "/organization_fields/reorder",
  "ticket_fields.reorder": "/ticket_fields/reorder",
  "triggers.reorder": "/triggers/reorder",
  "user_fields.reorder": "/user_fields/reorder",
  "end_users.identities.request_verification": "/end_users/{{user_id}}/identities/{{user_identity_id}}/request_verification",
  "users.request_create": "/users/request_create",
  "users.identities.request_verification": "/users/{{user_id}}/identities/{{user_identity_id}}/request_verification",
  "deleted_tickets.restore_many": "/deleted_tickets/restore_many",
  "deleted_tickets.restore": "/deleted_tickets/{{ticket_id}}/restore",
  "custom_objects.records.search": "/custom_objects/{{custom_object_key}}/records/search",
  "help_center.articles.search": "/help_center/articles/search",
  "object_triggers.search": "/custom_objects/{{custom_object_key}}/triggers/search",
  "custom_statuses.set_default": "/custom_statuses/update_many",
  "users.group_memberships.make_default": "/users/{{user_id}}/group_memberships/{{group_membership_id}}/make_default",
  "users.organizations.make_default": "/users/{{user_id}}/organizations/{{organization_id}}/make_default",
  "custom_objects.access_rules.get": "/custom_objects/{{custom_object_key}}/access_rules/{{id}}",
  "custom_objects.get": "/custom_objects/{{custom_object_key}}",
  "custom_objects.records.get": "/custom_objects/{{custom_object_key}}/records/{{custom_object_record_id}}",
  "job_statuses.show_many": "/job_statuses/show_many",
  "custom_objects.permission_policies.get": "/custom_objects/{{custom_object_key}}/permission_policies/{{id}}",
  "users.organizations.delete": "/users/{{user_id}}/organizations/{{organization_id}}",
  "custom_objects.access_rules.update": "/custom_objects/{{custom_object_key}}/access_rules/{{id}}",
  "apps.installations.update": "/apps/installations/{{app_installation_id}}",
  "automations.update": "/automations/{{automation_id}}",
  "custom_objects.update": "/custom_objects/{{custom_object_key}}",
  "custom_objects.records.update": "/custom_objects/{{custom_object_key}}/records/{{custom_object_record_id}}",
  "custom_statuses.update": "/custom_statuses/{{custom_status_id}}",
  "deletion_schedules.update": "/deletion_schedules/{{deletion_schedule_id}}",
  "dynamic_content.variants.update": "/dynamic_content/items/{{dynamic_content_item_id}}/variants/{{dynamic_content_variant_id}}",
  "dynamic_content.variants.update_many": "/dynamic_content/items/{{dynamic_content_item_id}}/variants/update_many",
  "macros.update": "/macros/{{macro_id}}",
  "automations.update_many": "/automations/update_many",
  "macros.update_many": "/macros/update_many",
  "object_triggers.update_many": "/custom_objects/{{custom_object_key}}/triggers/update_many",
  "organizations.update_many": "/organizations/update_many",
  "tickets.update_many": "/tickets/update_many",
  "triggers.update_many": "/triggers/update_many",
  "users.update_many": "/users/update_many",
  "views.update_many": "/views/update_many",
  "object_triggers.update": "/custom_objects/{{custom_object_key}}/triggers/{{trigger_id}}",
  "organization_fields.update": "/organization_fields/{{organization_field_id}}",
  "organizations.tags.update": "/organizations/{{organization_id}}/tags",
  "custom_objects.permission_policies.update": "/custom_objects/{{custom_object_key}}/permission_policies/{{id}}",
  "resource_collections.update": "/resource_collections/{{resource_collection_id}}",
  "side_conversations.update": "/tickets/{{ticket_id}}/side_conversations/{{side_conversation_id}}",
  "recipient_addresses.update": "/recipient_addresses/{{support_address_id}}",
  "targets.update": "/targets/{{target_id}}",
  "ticket_fields.update": "/ticket_fields/{{ticket_field_id}}",
  "tickets.tags.update": "/tickets/{{ticket_id}}/tags",
  "triggers.update": "/triggers/{{trigger_id}}",
  "trigger_categories.update": "/trigger_categories/{{trigger_category_id}}",
  "user_fields.update": "/user_fields/{{user_field_id}}",
  "user_profiles.update_by_identifier": "/user_profiles",
  "user_profiles.update": "/user_profiles/{{profile_id}}",
  "users.identities.update": "/users/{{user_id}}/identities/{{user_identity_id}}",
  "users.me.settings.update": "/users/me/settings",
  "users.profiles.update": "/users/{{user_id}}/profiles",
  "users.tags.update": "/users/{{user_id}}/tags",
  "views.update": "/views/{{view_id}}",
  "account.settings.update": "/account/settings",
  "attachments.update": "/attachments/{{attachment_id}}",
  "custom_objects.fields.update": "/custom_objects/{{custom_object_key}}/fields/{{custom_object_field_key_or_id}}",
  "dynamic_content.update": "/dynamic_content/items/{{dynamic_content_item_id}}",
  "requests.update": "/requests/{{request_id}}",
  "custom_objects.records.upsert": "/custom_objects/{{custom_object_key}}/records",
  "accounts.available": "/accounts/available",
  "recipient_addresses.verify": "/recipient_addresses/{{support_address_id}}/verify",
  "users.identities.verify": "/users/{{user_id}}/identities/{{user_identity_id}}/verify",
  "attachments.upload": "/uploads",
  "custom_objects.records.attachments.create": "/custom_objects/{{custom_object_key}}/records/{{record_id}}/attachments",
  "organizations.tags.delete": "/organizations/{{organization_id}}/tags",
  "tickets.tags.delete": "/tickets/{{ticket_id}}/tags",
  "users.tags.delete": "/users/{{user_id}}/tags",
  "attachments.download": "/attachments/{{attachment_id}}",
  "custom_objects.records.attachments.download": "/custom_objects/{{custom_object_key}}/records/{{record_id}}/attachments/{{id}}/download",
  "apps.public_key.pem": "/apps/{{app_id}}/public_key.pem"
} as Record<string, string>;
const METHODS = {
  "healthcheck": "GET",
  "macros.list": "GET",
  "organizations.create": "POST",
  "organizations.delete": "DELETE",
  "organizations.get": "GET",
  "organizations.list": "GET",
  "organizations.search": "GET",
  "organizations.update": "PUT",
  "requests.create": "POST",
  "requests.get": "GET",
  "requests.list": "GET",
  "search": "GET",
  "search.count": "GET",
  "ticket_fields.list": "GET",
  "tickets.comments.list": "GET",
  "tickets.count": "GET",
  "tickets.create": "POST",
  "tickets.delete": "DELETE",
  "tickets.get": "GET",
  "tickets.list": "GET",
  "tickets.merge": "POST",
  "tickets.recent": "GET",
  "tickets.related": "GET",
  "tickets.reply": "PUT",
  "tickets.show_many": "GET",
  "tickets.update": "PUT",
  "users.count": "GET",
  "users.create": "POST",
  "users.delete": "DELETE",
  "users.get": "GET",
  "users.list": "GET",
  "users.me": "GET",
  "users.search": "GET",
  "users.show_many": "GET",
  "users.update": "PUT",
  "views.execute": "GET",
  "views.list": "GET",
  "macros.apply_to_ticket": "GET",
  "problems.autocomplete": "POST",
  "users.autocomplete": "POST",
  "brands.host_mapping.check": "GET",
  "deleted_users.count": "GET",
  "users.ccd_tickets.count": "GET",
  "custom_objects.records.count": "GET",
  "organizations.count": "GET",
  "custom_objects.access_rules.create": "POST",
  "apps.installations.create": "POST",
  "apps.notify": "POST",
  "tags.autocomplete": "POST",
  "automations.create": "POST",
  "bookmarks.create": "POST",
  "tickets.comments.redact": "PUT",
  "custom_objects.jobs.create": "POST",
  "custom_objects.records.create": "POST",
  "custom_statuses.create": "POST",
  "deletion_schedules.create": "POST",
  "dynamic_content.create": "POST",
  "dynamic_content.variants.create": "POST",
  "end_users.identities.create": "POST",
  "group_memberships.create": "POST",
  "tickets.import_many": "POST",
  "dynamic_content.variants.create_many": "POST",
  "tickets.create_many": "POST",
  "users.create_many": "POST",
  "object_triggers.create": "POST",
  "organization_fields.create": "POST",
  "organization_memberships.create": "POST",
  "organization_memberships.create_many": "POST",
  "organizations.merge": "POST",
  "organizations.tags.create": "POST",
  "organization_subscriptions.create": "POST",
  "users.create_or_update_many": "POST",
  "organizations.create_or_update": "POST",
  "users.create_or_update": "POST",
  "push_notification_devices.destroy_many": "POST",
  "resource_collections.create": "POST",
  "side_conversations.create": "POST",
  "recipient_addresses.create": "POST",
  "suspended_tickets.export": "POST",
  "tickets.content_pins.create": "POST",
  "ticket_fields.create": "POST",
  "ticket_fields.options.create": "POST",
  "triggers.create": "POST",
  "trigger_categories.jobs.create": "POST",
  "trigger_categories.create": "POST",
  "user_fields.options.create": "POST",
  "users.identities.create": "POST",
  "user_profiles.events.create": "POST",
  "users.logout_many": "POST",
  "users.organization_memberships.create": "POST",
  "users.tags.create": "POST",
  "views.create": "POST",
  "views.preview": "POST",
  "views.preview_count": "POST",
  "custom_objects.create": "POST",
  "custom_objects.fields.create": "POST",
  "groups.create": "POST",
  "tickets.import": "POST",
  "targets.create": "POST",
  "channels.voice.tickets.create": "POST",
  "user_fields.create": "POST",
  "custom_objects.access_rules.delete": "DELETE",
  "automations.delete": "DELETE",
  "business_hours.schedules.delete": "DELETE",
  "custom_objects.records.attachments.delete": "DELETE",
  "custom_objects.records.delete_by_external_id_or_name": "DELETE",
  "deleted_tickets.delete": "DELETE",
  "deletion_schedules.delete": "DELETE",
  "group_memberships.delete": "DELETE",
  "group_memberships.destroy_many": "DELETE",
  "macros.delete": "DELETE",
  "macros.destroy_many": "DELETE",
  "automations.destroy_many": "DELETE",
  "object_triggers.destroy_many": "DELETE",
  "organization_memberships.destroy_many": "DELETE",
  "views.destroy_many": "DELETE",
  "organization_fields.delete": "DELETE",
  "organization_memberships.delete": "DELETE",
  "organization_subscriptions.delete": "DELETE",
  "resource_collections.delete": "DELETE",
  "suspended_tickets.destroy_many": "DELETE",
  "targets.delete": "DELETE",
  "ticket_fields.delete": "DELETE",
  "ticket_fields.options.delete": "DELETE",
  "triggers.delete": "DELETE",
  "trigger_categories.delete": "DELETE",
  "user_fields.delete": "DELETE",
  "user_fields.options.delete": "DELETE",
  "deleted_users.delete": "DELETE",
  "user_profiles.delete": "DELETE",
  "users.destroy_many": "DELETE",
  "users.sessions.delete": "DELETE",
  "users.group_memberships.delete": "DELETE",
  "users.identities.delete": "DELETE",
  "users.me.logout": "DELETE",
  "users.organization_memberships.delete": "DELETE",
  "users.sessions.delete_all": "DELETE",
  "views.delete": "DELETE",
  "apps.installations.delete": "DELETE",
  "bookmarks.delete": "DELETE",
  "custom_objects.delete": "DELETE",
  "custom_objects.fields.delete": "DELETE",
  "custom_objects.records.delete": "DELETE",
  "custom_statuses.delete": "DELETE",
  "dynamic_content.delete": "DELETE",
  "dynamic_content.variants.delete": "DELETE",
  "object_triggers.delete": "DELETE",
  "recipient_addresses.delete": "DELETE",
  "deleted_tickets.destroy_many": "DELETE",
  "organizations.destroy_many": "DELETE",
  "locales.detect_best": "GET",
  "account.settings.get": "GET",
  "triggers.list_active": "GET",
  "activities.count": "GET",
  "apps.get": "GET",
  "apps.installations.requirements": "GET",
  "apps.locations.get": "GET",
  "apps.location_installations.list": "GET",
  "apps.public_key.get": "GET",
  "attachments.get": "GET",
  "tags.autocomplete_get": "GET",
  "automations.get": "GET",
  "automations.list": "GET",
  "automations.search": "GET",
  "brands.list": "GET",
  "brands.get": "GET",
  "brands.agents.list": "GET",
  "custom_objects.fields.limit": "GET",
  "custom_objects.records.limit": "GET",
  "custom_objects.limit": "GET",
  "custom_statuses.get": "GET",
  "custom_statuses.list": "GET",
  "deleted_tickets.list": "GET",
  "deleted_users.get": "GET",
  "deletion_schedules.get": "GET",
  "deletion_schedules.list": "GET",
  "dynamic_content.list": "GET",
  "dynamic_content.get": "GET",
  "dynamic_content.show_many": "GET",
  "dynamic_content.variants.list": "GET",
  "dynamic_content.variants.get": "GET",
  "email_notifications.get": "GET",
  "email_notifications.list": "GET",
  "email_notifications.show_many": "GET",
  "end_users.identities.list": "GET",
  "end_users.identities.get": "GET",
  "group_memberships.get": "GET",
  "group_memberships.list": "GET",
  "groups.memberships.list": "GET",
  "groups.list_assignable": "GET",
  "groups.count": "GET",
  "groups.users.count": "GET",
  "groups.users.list": "GET",
  "guide.survey_responses.list": "GET",
  "guide.surveys.list": "GET",
  "incremental.organizations": "GET",
  "incremental.routing.attributes": "GET",
  "incremental.routing.attribute_values": "GET",
  "incremental.routing.instance_values": "GET",
  "incremental.tickets.sample": "GET",
  "incremental.ticket_events": "GET",
  "incremental.ticket_metric_events": "GET",
  "incremental.tickets": "GET",
  "incremental.tickets.cursor": "GET",
  "incremental.users": "GET",
  "incremental.users.cursor": "GET",
  "job_statuses.list": "GET",
  "job_statuses.get": "GET",
  "locales.get": "GET",
  "locales.list": "GET",
  "locales.agent": "GET",
  "locales.current": "GET",
  "macros.get": "GET",
  "macros.attachments.list": "GET",
  "macros.categories.list": "GET",
  "macros.definitions": "GET",
  "macros.replica": "GET",
  "macros.actions": "GET",
  "macros.list_active": "GET",
  "macros.apply": "GET",
  "macros.search": "GET",
  "object_triggers.get": "GET",
  "requests.list_open": "GET",
  "organization_fields.get": "GET",
  "organization_fields.list": "GET",
  "organization_memberships.get": "GET",
  "organizations.related": "GET",
  "organizations.requests.list": "GET",
  "organizations.autocomplete": "GET",
  "organizations.merges.list": "GET",
  "organizations.show_many": "GET",
  "organizations.tickets.count": "GET",
  "organization_subscriptions.get": "GET",
  "organization_subscriptions.list": "GET",
  "organizations.tags.list": "GET",
  "organizations.tickets.list": "GET",
  "organizations.users.list": "GET",
  "organizations.users.count": "GET",
  "apps.owned.list": "GET",
  "problems.list": "GET",
  "locales.public": "GET",
  "account.remote_authentications": "GET",
  "requests.comments.list": "GET",
  "requests.list_ccd": "GET",
  "requests.comments.get": "GET",
  "requests.search": "GET",
  "requests.list_solved": "GET",
  "routing.agents.instance_values": "GET",
  "satisfaction_ratings.list": "GET",
  "satisfaction_ratings.count": "GET",
  "search.export": "GET",
  "account.security_settings": "GET",
  "side_conversations.events.list": "GET",
  "recipient_addresses.get": "GET",
  "tags.list": "GET",
  "tags.count": "GET",
  "targets.get": "GET",
  "target_failures.get": "GET",
  "target_failures.list": "GET",
  "targets.list": "GET",
  "tickets.audits.get": "GET",
  "tickets.collaborators.list": "GET",
  "tickets.email_ccs.list": "GET",
  "ticket_fields.get": "GET",
  "ticket_fields.count": "GET",
  "ticket_fields.show_many": "GET",
  "tickets.followers.list": "GET",
  "ticket_forms.list": "GET",
  "ticket_forms.show_many": "GET",
  "tickets.incidents.list": "GET",
  "ticket_metrics.get": "GET",
  "ticket_metrics.list": "GET",
  "tickets.audits.list": "GET",
  "tickets.audits.count": "GET",
  "tickets.comments.count": "GET",
  "tickets.conversation_log.get": "GET",
  "tickets.skips.list": "GET",
  "tickets.sla_policy_metrics.get": "GET",
  "tickets.metrics.get": "GET",
  "tickets.side_conversations.events": "GET",
  "triggers.get": "GET",
  "trigger_categories.list": "GET",
  "trigger_categories.get": "GET",
  "triggers.list": "GET",
  "triggers.definitions": "GET",
  "triggers.search": "GET",
  "users.entitlements.get": "GET",
  "users.events.list": "GET",
  "user_fields.get": "GET",
  "user_fields.options.list": "GET",
  "user_fields.list": "GET",
  "user_fields.show_many": "GET",
  "user_profiles.get": "GET",
  "user_profiles.events.list": "GET",
  "users.assigned_tickets.list": "GET",
  "users.autocomplete_get": "GET",
  "users.brand_agents.list": "GET",
  "users.ccd_tickets.list": "GET",
  "users.compliance_deletion_statuses": "GET",
  "users.sessions.list": "GET",
  "users.followed_tickets.list": "GET",
  "users.group_memberships.list": "GET",
  "users.group_memberships.get": "GET",
  "users.groups.list": "GET",
  "users.groups.count": "GET",
  "users.identities.get": "GET",
  "users.me.session": "GET",
  "users.me.settings.get": "GET",
  "users.organization_memberships.list": "GET",
  "users.organization_memberships.get": "GET",
  "users.organizations.list": "GET",
  "users.organizations.count": "GET",
  "users.organization_subscriptions.list": "GET",
  "users.password_requirements": "GET",
  "users.profiles.list": "GET",
  "users.related": "GET",
  "users.requested_tickets.list": "GET",
  "users.requests.list": "GET",
  "users.skips.list": "GET",
  "users.tags.list": "GET",
  "users.assigned_tickets.count": "GET",
  "views.definitions": "GET",
  "views.list_active": "GET",
  "views.compact": "GET",
  "views.count": "GET",
  "views.count_many": "GET",
  "views.export": "GET",
  "views.search": "GET",
  "views.show_many": "GET",
  "views.tickets.list": "GET",
  "views.tickets.count": "GET",
  "activities.list": "GET",
  "custom_roles.list": "GET",
  "organizations.merges.get": "GET",
  "organizations.subscriptions.list": "GET",
  "sessions.list": "GET",
  "sharing_agreements.list": "GET",
  "suspended_tickets.list": "GET",
  "ticket_fields.options.list": "GET",
  "ticket_fields.options.get": "GET",
  "ticket_forms.get": "GET",
  "side_conversations.get": "GET",
  "tickets.tags.list": "GET",
  "automations.list_active": "GET",
  "apps.installations.list": "GET",
  "apps.locations.list": "GET",
  "group_memberships.list_assignable": "GET",
  "groups.memberships.list_assignable": "GET",
  "bookmarks.list": "GET",
  "brand_agents.list": "GET",
  "custom_objects.records.attachments.list": "GET",
  "custom_objects.records.list": "GET",
  "deleted_users.list": "GET",
  "help_center.articles.list": "GET",
  "incremental.custom_object_records": "GET",
  "channels.twitter.monitored_handles": "GET",
  "object_triggers.list": "GET",
  "object_triggers.definitions": "GET",
  "organization_memberships.list": "GET",
  "organizations.memberships.list": "GET",
  "resource_collections.list": "GET",
  "skips.list": "GET",
  "recipient_addresses.list": "GET",
  "ticket_audits.list": "GET",
  "tickets.content_pins.list": "GET",
  "users.identities.list": "GET",
  "custom_objects.access_rules.list": "GET",
  "custom_objects.fields.list": "GET",
  "custom_objects.list": "GET",
  "custom_objects.permission_policies.list": "GET",
  "tickets.comments.make_private": "PUT",
  "users.organization_memberships.make_default": "PUT",
  "end_users.identities.make_primary": "PUT",
  "tickets.audits.make_private": "PUT",
  "users.identities.make_primary": "PUT",
  "tickets.mark_many_as_spam": "PUT",
  "users.merge": "PUT",
  "users.open": "PUT",
  "suspended_tickets.recover_many": "PUT",
  "users.me.session.renew": "POST",
  "custom_objects.fields.reorder": "PUT",
  "apps.location_installations.reorder": "PUT",
  "organization_fields.reorder": "PUT",
  "ticket_fields.reorder": "PUT",
  "triggers.reorder": "PUT",
  "user_fields.reorder": "PUT",
  "end_users.identities.request_verification": "PUT",
  "users.request_create": "POST",
  "users.identities.request_verification": "PUT",
  "deleted_tickets.restore_many": "PUT",
  "deleted_tickets.restore": "PUT",
  "custom_objects.records.search": "POST",
  "help_center.articles.search": "GET",
  "object_triggers.search": "GET",
  "custom_statuses.set_default": "PUT",
  "users.group_memberships.make_default": "PUT",
  "users.organizations.make_default": "PUT",
  "custom_objects.access_rules.get": "GET",
  "custom_objects.get": "GET",
  "custom_objects.records.get": "GET",
  "job_statuses.show_many": "GET",
  "custom_objects.permission_policies.get": "GET",
  "users.organizations.delete": "DELETE",
  "custom_objects.access_rules.update": "PATCH",
  "apps.installations.update": "PUT",
  "automations.update": "PUT",
  "custom_objects.update": "PATCH",
  "custom_objects.records.update": "PATCH",
  "custom_statuses.update": "PUT",
  "deletion_schedules.update": "PUT",
  "dynamic_content.variants.update": "PUT",
  "dynamic_content.variants.update_many": "PUT",
  "macros.update": "PUT",
  "automations.update_many": "PUT",
  "macros.update_many": "PUT",
  "object_triggers.update_many": "PUT",
  "organizations.update_many": "PUT",
  "tickets.update_many": "PUT",
  "triggers.update_many": "PUT",
  "users.update_many": "PUT",
  "views.update_many": "PUT",
  "object_triggers.update": "PUT",
  "organization_fields.update": "PUT",
  "organizations.tags.update": "PUT",
  "custom_objects.permission_policies.update": "PATCH",
  "resource_collections.update": "PUT",
  "side_conversations.update": "PATCH",
  "recipient_addresses.update": "PUT",
  "targets.update": "PUT",
  "ticket_fields.update": "PUT",
  "tickets.tags.update": "PUT",
  "triggers.update": "PUT",
  "trigger_categories.update": "PUT",
  "user_fields.update": "PUT",
  "user_profiles.update_by_identifier": "PUT",
  "user_profiles.update": "PUT",
  "users.identities.update": "PUT",
  "users.me.settings.update": "PUT",
  "users.profiles.update": "PUT",
  "users.tags.update": "PUT",
  "views.update": "PUT",
  "account.settings.update": "PUT",
  "attachments.update": "PUT",
  "custom_objects.fields.update": "PATCH",
  "dynamic_content.update": "PUT",
  "requests.update": "PUT",
  "custom_objects.records.upsert": "PATCH",
  "accounts.available": "GET",
  "recipient_addresses.verify": "PUT",
  "users.identities.verify": "PUT",
  "attachments.upload": "POST",
  "custom_objects.records.attachments.create": "POST",
  "organizations.tags.delete": "DELETE",
  "tickets.tags.delete": "DELETE",
  "users.tags.delete": "DELETE",
  "attachments.download": "GET",
  "custom_objects.records.attachments.download": "GET",
  "apps.public_key.pem": "GET"
} as Record<string, string>;
const compiled = compileDeclarativeConnector(manifest as never);
const actions = { ...compiled.actions, ...zendeskActions };

const FIXTURE_SUBDOMAIN = "acme";
const FIXTURE_EMAIL = "agent@example.com";
const FIXTURE_TOKEN = "dummy-token";
const BASIC = `Basic ${Buffer.from(`${FIXTURE_EMAIL}/token:${FIXTURE_TOKEN}`, "utf8").toString("base64")}`;

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    input[key] = dummyValue(prop);
  }
  return input;
}

function dummyValue(prop: { type?: unknown; enum?: unknown[]; items?: any; properties?: Record<string, any>; required?: string[] }): unknown {
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
  if (prop.type === "integer" || prop.type === "number") return 1;
  if (prop.type === "boolean") return true;
  if (prop.type === "array") {
    const items = prop.items ?? {};
    if (items.type === "integer" || items.type === "number") return [1];
    if (items.type === "object") return [dummyInput(items)];
    if (Array.isArray(items.enum) && items.enum.length > 0) return [items.enum[0]];
    return ["x"];
  }
  if (prop.type === "object") return dummyInput(prop);
  return "x";
}

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return ak.length === bk.length && ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

describe("zendesk manifest", () => {
  test("has subdomain host, API token basic auth, version, and compiles", () => {
    expect(manifest.key).toBe("zendesk");
    expect(manifest.version).toBe("0.2.2");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.network.allowedHosts).toEqual(["*.zendesk.com"]);
    expect(manifest.http.baseUrl).toBe("https://{{subdomain}}.zendesk.com/api/v2");
    expect(manifest.http.auth).toMatchObject({
      field: "apiToken",
      in: "header",
      name: "Authorization",
      basic: { username: "{{email}}/token", password: "{{apiToken}}" },
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["subdomain", "email", "apiToken"]);
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("covers mapped Composio ZENDESK tools with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS).length).toBe(457);
    expect(Object.keys(operations).length).toBe(458);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(compiled.actions.healthcheck).toBeTypeOf("function");
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(Number(operation.maxResponseBytes), key).toBeGreaterThanOrEqual(Number(operation.maxInputBytes));
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
      expect(PATHS[key], key).toBe(request.path);
      expect(METHODS[key], key).toBe(request.method);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("puts JSON Content-Type only on bodies and keeps GET body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.bodyEncoding === "raw") {
        expect(headers["Content-Type"], key).toBe("application/octet-stream");
      } else if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps Zendesk Support API paths and Composio aliases", () => {
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/users/me" });
    expect(requestOf("tickets.list").path).toBe("/tickets");
    expect(requestOf("tickets.get").path).toBe("/tickets/{{ticket_id}}");
    expect(requestOf("tickets.create").path).toBe("/tickets");
    expect(requestOf("tickets.update").path).toBe("/tickets/{{ticket_id}}");
    expect(requestOf("tickets.delete").path).toBe("/tickets/{{ticket_id}}");
    expect(requestOf("users.me").path).toBe("/users/me");
    expect(requestOf("search").path).toBe("/search");
    expect(requestOf("macros.apply_to_ticket").path).toBe("/tickets/{{ticket_id}}/macros/{{macro_id}}/apply");
    expect(requestOf("groups.create").path).toBe("/groups");
    expect(requestOf("automations.create").method).toBe("POST");
    expect(requestOf("custom_objects.list").path).toBe("/custom_objects");
    expect(requestOf("triggers.list").path).toBe("/triggers");
    expect((requestOf("tickets.create").body as { ticket: { comment: { body: string } } }).ticket.comment.body).toBe("{{description}}");
    expect((requestOf("tickets.reply").body as { ticket: { comment: { body: string } } }).ticket.comment.body).toBe("{{body}}");
    expect(requestOf("attachments.upload")).toMatchObject({
      method: "POST",
      path: "/uploads",
      bodyEncoding: "raw",
      query: { filename: "{{filename}}" },
      body: "{{content}}",
    });
    expect(requestOf("apps.public_key.pem").path).toBe("/apps/{{app_id}}/public_key.pem");
    expect(requestOf("tickets.tags.delete")).toMatchObject({ method: "DELETE", path: "/tickets/{{ticket_id}}/tags" });
    expect(requestOf("users.tags.delete").path).toBe("/users/{{user_id}}/tags");
    expect(requestOf("organizations.tags.delete").path).toBe("/organizations/{{organization_id}}/tags");
    expect(requestOf("custom_objects.records.attachments.create").path).toBe("/custom_objects/{{custom_object_key}}/records/{{record_id}}/attachments");
    expect(requestOf("custom_objects.records.attachments.download").path).toBe("/custom_objects/{{custom_object_key}}/records/{{record_id}}/attachments/{{id}}/download");
  });
});

describe("zendesk compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await actions[key]!({
      ...input,
      apiToken: FIXTURE_TOKEN,
      email: FIXTURE_EMAIL,
      subdomain: FIXTURE_SUBDOMAIN,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  function dummyResponse(operation: Record<string, unknown>): unknown {
    if ((operation.request as { result?: unknown }).result !== undefined) return {};
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("acme.zendesk.com");
      expect(new URL(requests[0]!.url).pathname.startsWith("/api/v2/"), key).toBe(true);
      expect(requests[0]!.headers.get("authorization"), key).toBe(BASIC);
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "zendesk", action: key, source: "provider" });
    }
  });

  test("healthcheck probes GET /api/v2/users/me", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ user: { id: 1 } }));
    expect(new URL(requests[0]!.url).href).toBe("https://acme.zendesk.com/api/v2/users/me");
    expect(requests[0]!.method).toBe("GET");
  });

  test("omits unset list filters and encodes cursor pagination", async () => {
    const bare = await invoke("tickets.list", {}, () => jsonResponse({ tickets: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://acme.zendesk.com/api/v2/tickets");
    const filtered = await invoke(
      "tickets.list",
      { page_size: 50, page_after: "cursor-1", sort_by: "updated_at", sort_order: "desc", external_id: "ext-9" },
      () => jsonResponse({ tickets: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("page[size]")).toBe("50");
    expect(url.searchParams.get("page[after]")).toBe("cursor-1");
    expect(url.searchParams.get("sort_by")).toBe("updated_at");
    expect(url.searchParams.get("sort_order")).toBe("desc");
    expect(url.searchParams.get("external_id")).toBe("ext-9");
  });

  test("creates a ticket with description as the first comment", async () => {
    const { requests } = await invoke(
      "tickets.create",
      { subject: "Cannot log in", description: "Password reset failed", priority: "high", requester_id: 44 },
      () => jsonResponse({ ticket: { id: 2 } }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v2/tickets");
    expect(await requests[0]!.json()).toEqual({
      ticket: {
        subject: "Cannot log in",
        comment: { body: "Password reset failed" },
        priority: "high",
        requester_id: 44,
        requester: {},
      },
    });
  });

  test("replies by putting a comment on the ticket", async () => {
    const { requests } = await invoke(
      "tickets.reply",
      { ticket_id: 35436, body: "Working on it", public: false },
      () => jsonResponse({ ticket: { id: 35436 } }),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v2/tickets/35436");
    expect(await requests[0]!.json()).toEqual({
      ticket: { comment: { body: "Working on it", public: false } },
    });
  });

  test("merges source ticket ids into the target path", async () => {
    const { requests } = await invoke(
      "tickets.merge",
      { target_ticket_id: 10, source_ticket_ids: [11, 12] },
      () => jsonResponse({ job_status: { id: "j1" } }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v2/tickets/10/merge");
    expect(await requests[0]!.json()).toEqual({ ids: [11, 12] });
  });

  test("deletes a ticket with a static success envelope on 204", async () => {
    const { requests, result } = await invoke("tickets.delete", { ticket_id: 9 }, () => new Response(null, { status: 204 }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v2/tickets/9");
    expect(result).toEqual({ connector: "zendesk", action: "tickets.delete", source: "provider", success: true });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ error: "Couldn't authenticate you" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "8", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 8 });
  });

  test("rejects extra healthcheck fields and a missing ticket id before fetch", async () => {
    await expect(invoke("healthcheck", { nope: true }, () => jsonResponse({}))).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(invoke("tickets.get", {}, () => jsonResponse({}))).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("runs fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(200);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: unknown };
          response: { status: number; headers?: Record<string, string>; bodyFile?: string };
        }>;
        expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
      };
      const action = actions[raw.operation];
      expect(action, raw.id).toBeTypeOf("function");
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = raw.exchanges[index++];
        if (!expected) throw new Error(`${raw.id}: extra request`);
        const url = String(input instanceof Request ? input.url : input);
        const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${raw.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const rawBody = init?.body == null ? null : init.body;
        if (expected.request.body === null) {
          const isMultipart = typeof FormData !== "undefined" && rawBody instanceof FormData;
          if (!isMultipart && rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${String(rawBody)}`);
        } else if (typeof expected.request.body === "object") {
          const text = typeof rawBody === "string" ? rawBody : rawBody == null ? null : String(rawBody);
          if (!deepEqual(text ? JSON.parse(text) : null, expected.request.body)) {
            throw new Error(`${raw.id}: body mismatch ${text}`);
          }
        } else if (String(rawBody) !== expected.request.body) {
          throw new Error(`${raw.id}: body mismatch ${String(rawBody)}`);
        }
        const got = new Headers(init?.headers);
        for (const [headerKey, value] of Object.entries(expected.request.headers ?? {})) {
          if (got.get(headerKey) !== value) throw new Error(`${raw.id}: header ${headerKey}=${got.get(headerKey)}!=${value}`);
        }
        const status = expected.response.status;
        if (status === 204) return new Response(null, { status, headers: expected.response.headers });
        const encoded = (expected.response as { bodyBase64?: string }).bodyBase64;
        const bodyBytes = typeof encoded === "string"
          ? Buffer.from(encoded, "base64")
          : expected.response.bodyFile
            ? readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile))
            : Buffer.from("{}");
        return new Response(bodyBytes, { status, headers: expected.response.headers });
      };
      const input = { ...raw.input, ...raw.credentials, fetch: fetchStub };
      if (raw.expected.kind === "error") {
        let rejected: { code?: string } | undefined;
        try {
          await action!(input);
        } catch (error) {
          rejected = error as { code?: string };
        }
        expect(index, raw.id).toBe(raw.exchanges.length);
        expect(rejected?.code, raw.id).toBe(raw.expected.code);
        continue;
      }
      const result = await action!(input);
      expect(index, raw.id).toBe(raw.exchanges.length);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
