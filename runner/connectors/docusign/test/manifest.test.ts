import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";
import { executeTransport } from "../src/handlers";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const PATHS = {
  "healthcheck": "/login_information",
  "userinfo.get": "/oauth/userinfo",
  "service.get": "/service_information",
  "accounts.get": "/accounts/{{accountId}}",
  "accounts.settings.get": "/accounts/{{accountId}}/settings",
  "accounts.billing_charges.list": "/accounts/{{accountId}}/billing_charges",
  "accounts.custom_fields.list": "/accounts/{{accountId}}/custom_fields",
  "accounts.recipient_names.get": "/accounts/{{accountId}}/recipient_names",
  "brands.list": "/accounts/{{accountId}}/brands",
  "groups.list": "/accounts/{{accountId}}/groups",
  "signing_groups.list": "/accounts/{{accountId}}/signing_groups",
  "signing_groups.get": "/accounts/{{accountId}}/signing_groups/{{signingGroupId}}",
  "signing_groups.create": "/accounts/{{accountId}}/signing_groups",
  "signing_groups.users.list": "/accounts/{{accountId}}/signing_groups/{{signingGroupId}}/users",
  "users.list": "/accounts/{{accountId}}/users",
  "users.get": "/accounts/{{accountId}}/users/{{userId}}",
  "users.create": "/accounts/{{accountId}}/users",
  "users.settings.get": "/accounts/{{accountId}}/users/{{userId}}/settings",
  "users.profile.get": "/accounts/{{accountId}}/users/{{userId}}/profile",
  "templates.list": "/accounts/{{accountId}}/templates",
  "templates.get": "/accounts/{{accountId}}/templates/{{templateId}}",
  "templates.favorites.list": "/accounts/{{accountId}}/favorite_templates",
  "envelopes.create": "/accounts/{{accountId}}/envelopes",
  "envelopes.create_from_template": "/accounts/{{accountId}}/envelopes",
  "envelopes.send": "/accounts/{{accountId}}/envelopes/{{envelopeId}}",
  "envelopes.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}",
  "envelopes.audit_events.list": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/audit_events",
  "envelopes.form_data.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/form_data",
  "envelopes.custom_fields.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/custom_fields",
  "envelopes.custom_fields.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/custom_fields",
  "envelopes.email_settings.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/email_settings",
  "envelopes.email_settings.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/email_settings",
  "envelopes.notification.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/notification",
  "envelopes.attachments.list": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/attachments",
  "envelopes.templates.list": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/templates",
  "envelopes.templates.apply": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/templates",
  "envelopes.workflow.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow",
  "envelopes.views.recipient.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/views/recipient",
  "envelopes.views.sender.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/views/sender",
  "envelopes.views.edit.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/views/edit",
  "envelopes.views.correct.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/views/correct",
  "envelopes.views.recipient_preview.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/views/recipient_preview",
  "connect.list": "/accounts/{{accountId}}/connect",
  "envelopes.list": "/accounts/{{accountId}}/envelopes",
  "envelopes.recipients.list": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients",
  "envelopes.documents.list": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents",
  "folders.list": "/accounts/{{accountId}}/folders",
  "powerforms.list": "/accounts/{{accountId}}/powerforms",
  "contacts.create": "/accounts/{{accountId}}/contacts",
  "contacts.update": "/accounts/{{accountId}}/contacts",
  "contacts.get": "/accounts/{{accountId}}/contacts/{{contactId}}",
  "contacts.delete": "/accounts/{{accountId}}/contacts/{{contactId}}",
  "brands.create": "/accounts/{{accountId}}/brands",
  "brands.get": "/accounts/{{accountId}}/brands/{{brandId}}",
  "brands.update": "/accounts/{{accountId}}/brands/{{brandId}}",
  "brands.delete": "/accounts/{{accountId}}/brands/{{brandId}}",
  "brands.resources.list": "/accounts/{{accountId}}/brands/{{brandId}}/resources",
  "brands.logos.delete": "/accounts/{{accountId}}/brands/{{brandId}}/logos/{{logoType}}",
  "groups.brands.list": "/accounts/{{accountId}}/groups/{{groupId}}/brands",
  "groups.brands.update": "/accounts/{{accountId}}/groups/{{groupId}}/brands",
  "bulk_send.batches.list": "/accounts/{{accountId}}/bulk_send_batch",
  "bulk_send.batches.get": "/accounts/{{accountId}}/bulk_send_batch/{{bulkSendBatchId}}",
  "bulk_send.batches.update": "/accounts/{{accountId}}/bulk_send_batch/{{bulkSendBatchId}}",
  "bulk_send.batches.action": "/accounts/{{accountId}}/bulk_send_batch/{{bulkSendBatchId}}/{{bulkAction}}",
  "bulk_send.lists.list": "/accounts/{{accountId}}/bulk_send_lists",
  "bulk_send.lists.delete": "/accounts/{{accountId}}/bulk_send_lists/{{bulkSendListId}}",
  "bulk_send.lists.send": "/accounts/{{accountId}}/bulk_send_lists/{{bulkSendListId}}/send",
  "bulk_send.lists.test": "/accounts/{{accountId}}/bulk_send_lists/{{bulkSendListId}}/test",
  "chunked_uploads.get": "/accounts/{{accountId}}/chunked_uploads/{{chunkedUploadId}}",
  "chunked_uploads.commit": "/accounts/{{accountId}}/chunked_uploads/{{chunkedUploadId}}",
  "chunked_uploads.delete": "/accounts/{{accountId}}/chunked_uploads/{{chunkedUploadId}}",
  "chunked_uploads.parts.add": "/accounts/{{accountId}}/chunked_uploads/{{chunkedUploadId}}/{{chunkedUploadPartSeq}}",
  "connect.create": "/accounts/{{accountId}}/connect",
  "connect.update": "/accounts/{{accountId}}/connect",
  "connect.get": "/accounts/{{accountId}}/connect/{{connectId}}",
  "connect.delete": "/accounts/{{accountId}}/connect/{{connectId}}",
  "connect.users.list": "/accounts/{{accountId}}/connect/{{connectId}}/users",
  "connect.users.list_all": "/accounts/{{accountId}}/connect/{{connectId}}/all/users",
  "connect.retry.envelope": "/accounts/{{accountId}}/connect/envelopes/{{envelopeId}}/retry_queue",
  "connect.retry.envelopes": "/accounts/{{accountId}}/connect/envelopes/retry_queue",
  "connect.publish.historical": "/accounts/{{accountId}}/connect/envelopes/publish/historical",
  "connect.failures.list": "/accounts/{{accountId}}/connect/failures",
  "connect.failures.delete": "/accounts/{{accountId}}/connect/failures/{{failureId}}",
  "connect.logs.list": "/accounts/{{accountId}}/connect/logs",
  "connect.logs.delete_all": "/accounts/{{accountId}}/connect/logs",
  "connect.logs.get": "/accounts/{{accountId}}/connect/logs/{{logId}}",
  "connect.logs.delete": "/accounts/{{accountId}}/connect/logs/{{logId}}",
  "connect.oauth.get": "/accounts/{{accountId}}/connect/oauth",
  "connect.oauth.create": "/accounts/{{accountId}}/connect/oauth",
  "connect.oauth.update": "/accounts/{{accountId}}/connect/oauth",
  "connect.oauth.delete": "/accounts/{{accountId}}/connect/oauth",
  "accounts.custom_fields.create": "/accounts/{{accountId}}/custom_fields",
  "accounts.custom_fields.update": "/accounts/{{accountId}}/custom_fields/{{customFieldId}}",
  "accounts.custom_fields.delete": "/accounts/{{accountId}}/custom_fields/{{customFieldId}}",
  "accounts.settings.update": "/accounts/{{accountId}}/settings",
  "accounts.password_rules.get": "/accounts/{{accountId}}/settings/password_rules",
  "accounts.password_rules.update": "/accounts/{{accountId}}/settings/password_rules",
  "accounts.notification_defaults.get": "/accounts/{{accountId}}/settings/notification_defaults",
  "accounts.notification_defaults.update": "/accounts/{{accountId}}/settings/notification_defaults",
  "accounts.tab_settings.get": "/accounts/{{accountId}}/settings/tabs",
  "accounts.tab_settings.update": "/accounts/{{accountId}}/settings/tabs",
  "accounts.purge.get": "/accounts/{{accountId}}/settings/envelope_purge_configuration",
  "accounts.purge.update": "/accounts/{{accountId}}/settings/envelope_purge_configuration",
  "accounts.consumer_disclosure.get": "/accounts/{{accountId}}/consumer_disclosure",
  "accounts.consumer_disclosure.update": "/accounts/{{accountId}}/consumer_disclosure/{{langCode}}",
  "accounts.unsupported_file_types.list": "/accounts/{{accountId}}/unsupported_file_types",
  "accounts.supported_languages.list": "/accounts/{{accountId}}/supported_languages",
  "accounts.seal_providers.list": "/accounts/{{accountId}}/seals",
  "accounts.signature_providers.list": "/accounts/{{accountId}}/signatureProviders",
  "accounts.identity_verification.list": "/accounts/{{accountId}}/identity_verification",
  "accounts.watermark.get": "/accounts/{{accountId}}/watermark",
  "accounts.watermark.update": "/accounts/{{accountId}}/watermark",
  "accounts.watermark.preview": "/accounts/{{accountId}}/watermark/preview",
  "accounts.shared_access.get": "/accounts/{{accountId}}/shared_access",
  "accounts.shared_access.update": "/accounts/{{accountId}}/shared_access",
  "accounts.delete": "/accounts/{{accountId}}",
  "accounts.provisioning.get": "/accounts/provisioning",
  "resource.get": "/",
  "bcc_email_archives.list": "/accounts/{{accountId}}/settings/bcc_email_archives",
  "bcc_email_archives.create": "/accounts/{{accountId}}/settings/bcc_email_archives",
  "bcc_email_archives.history.get": "/accounts/{{accountId}}/settings/bcc_email_archives/{{bccEmailArchiveId}}",
  "bcc_email_archives.delete": "/accounts/{{accountId}}/settings/bcc_email_archives/{{bccEmailArchiveId}}",
  "enote.get": "/accounts/{{accountId}}/settings/enote_configuration",
  "enote.update": "/accounts/{{accountId}}/settings/enote_configuration",
  "enote.delete": "/accounts/{{accountId}}/settings/enote_configuration",
  "groups.create": "/accounts/{{accountId}}/groups",
  "groups.update": "/accounts/{{accountId}}/groups",
  "groups.users.list": "/accounts/{{accountId}}/groups/{{groupId}}/users",
  "groups.users.add": "/accounts/{{accountId}}/groups/{{groupId}}/users",
  "permission_profiles.list": "/accounts/{{accountId}}/permission_profiles",
  "permission_profiles.create": "/accounts/{{accountId}}/permission_profiles",
  "permission_profiles.get": "/accounts/{{accountId}}/permission_profiles/{{permissionProfileId}}",
  "permission_profiles.update": "/accounts/{{accountId}}/permission_profiles/{{permissionProfileId}}",
  "permission_profiles.delete": "/accounts/{{accountId}}/permission_profiles/{{permissionProfileId}}",
  "signing_groups.update": "/accounts/{{accountId}}/signing_groups/{{signingGroupId}}",
  "signing_groups.update_names": "/accounts/{{accountId}}/signing_groups",
  "signing_groups.users.add": "/accounts/{{accountId}}/signing_groups/{{signingGroupId}}/users",
  "users.update": "/accounts/{{accountId}}/users/{{userId}}",
  "users.change": "/accounts/{{accountId}}/users",
  "users.close": "/accounts/{{accountId}}/users",
  "users.settings.update": "/accounts/{{accountId}}/users/{{userId}}/settings",
  "users.profile.update": "/accounts/{{accountId}}/users/{{userId}}/profile",
  "users.profile.image.delete": "/accounts/{{accountId}}/users/{{userId}}/profile/image",
  "users.custom_settings.get": "/accounts/{{accountId}}/users/{{userId}}/custom_settings",
  "users.custom_settings.update": "/accounts/{{accountId}}/users/{{userId}}/custom_settings",
  "users.signatures.list": "/accounts/{{accountId}}/users/{{userId}}/signatures",
  "users.signatures.update": "/accounts/{{accountId}}/users/{{userId}}/signatures",
  "users.signatures.get": "/accounts/{{accountId}}/users/{{userId}}/signatures/{{signatureId}}",
  "users.signatures.update_by_id": "/accounts/{{accountId}}/users/{{userId}}/signatures/{{signatureId}}",
  "users.signatures.delete": "/accounts/{{accountId}}/users/{{userId}}/signatures/{{signatureId}}",
  "users.signatures.image.delete": "/accounts/{{accountId}}/users/{{userId}}/signatures/{{signatureId}}/{{imageType}}",
  "users.authorizations.create": "/accounts/{{accountId}}/users/{{userId}}/authorization",
  "users.authorizations.get": "/accounts/{{accountId}}/users/{{userId}}/authorization/{{authorizationId}}",
  "users.authorizations.update": "/accounts/{{accountId}}/users/{{userId}}/authorization/{{authorizationId}}",
  "users.authorizations.delete": "/accounts/{{accountId}}/users/{{userId}}/authorization/{{authorizationId}}",
  "users.authorizations.list": "/accounts/{{accountId}}/users/{{userId}}/authorizations",
  "users.authorizations.create_many": "/accounts/{{accountId}}/users/{{userId}}/authorizations",
  "users.authorizations.agent.list": "/accounts/{{accountId}}/users/{{userId}}/authorizations/agent",
  "captive_recipients.delete": "/accounts/{{accountId}}/captive_recipients/{{recipientPart}}",
  "cloud_storage.list": "/accounts/{{accountId}}/users/{{userId}}/cloud_storage",
  "cloud_storage.create": "/accounts/{{accountId}}/users/{{userId}}/cloud_storage",
  "cloud_storage.get": "/accounts/{{accountId}}/users/{{userId}}/cloud_storage/{{serviceId}}",
  "cloud_storage.delete": "/accounts/{{accountId}}/users/{{userId}}/cloud_storage/{{serviceId}}",
  "cloud_storage.folders.list": "/accounts/{{accountId}}/users/{{userId}}/cloud_storage/{{serviceId}}/folders",
  "cloud_storage.folders.get": "/accounts/{{accountId}}/users/{{userId}}/cloud_storage/{{serviceId}}/folders/{{folderId}}",
  "stamps.list": "/accounts/{{accountId}}/signatures",
  "stamps.create": "/accounts/{{accountId}}/signatures",
  "stamps.update": "/accounts/{{accountId}}/signatures",
  "stamps.get": "/accounts/{{accountId}}/signatures/{{signatureId}}",
  "stamps.update_by_id": "/accounts/{{accountId}}/signatures/{{signatureId}}",
  "stamps.delete": "/accounts/{{accountId}}/signatures/{{signatureId}}",
  "stamps.image.delete": "/accounts/{{accountId}}/signatures/{{signatureId}}/{{imageType}}",
  "custom_tabs.list": "/accounts/{{accountId}}/tab_definitions",
  "custom_tabs.create": "/accounts/{{accountId}}/tab_definitions",
  "custom_tabs.get": "/accounts/{{accountId}}/tab_definitions/{{customTabId}}",
  "custom_tabs.update": "/accounts/{{accountId}}/tab_definitions/{{customTabId}}",
  "custom_tabs.delete": "/accounts/{{accountId}}/tab_definitions/{{customTabId}}",
  "billing.invoices.list": "/accounts/{{accountId}}/billing_invoices",
  "billing.invoices.get": "/accounts/{{accountId}}/billing_invoices/{{invoiceId}}",
  "billing.invoices.past_due.list": "/accounts/{{accountId}}/billing_invoices_past_due",
  "billing.payments.list": "/accounts/{{accountId}}/billing_payments",
  "billing.payments.create": "/accounts/{{accountId}}/billing_payments",
  "billing.payments.get": "/accounts/{{accountId}}/billing_payments/{{paymentId}}",
  "billing.plan.get": "/accounts/{{accountId}}/billing_plan",
  "billing.plan.update": "/accounts/{{accountId}}/billing_plan",
  "billing.credit_card.get": "/accounts/{{accountId}}/billing_plan/credit_card",
  "billing.downgrade.get": "/accounts/{{accountId}}/billing_plan/downgrade",
  "billing.downgrade.update": "/accounts/{{accountId}}/billing_plan/downgrade",
  "billing.purchased_envelopes.update": "/accounts/{{accountId}}/billing_plan/purchased_envelopes",
  "billing.plans.list": "/billing_plans",
  "payment_gateways.list": "/accounts/{{accountId}}/payment_gateway_accounts",
  "powerforms.get": "/accounts/{{accountId}}/powerforms/{{powerFormId}}",
  "powerforms.delete": "/accounts/{{accountId}}/powerforms/{{powerFormId}}",
  "powerforms.form_data.get": "/accounts/{{accountId}}/powerforms/{{powerFormId}}/form_data",
  "powerforms.senders.list": "/accounts/{{accountId}}/powerforms/senders",
  "folders.get": "/accounts/{{accountId}}/folders/{{folderId}}",
  "folders.update": "/accounts/{{accountId}}/folders/{{folderId}}",
  "templates.favorites.add": "/accounts/{{accountId}}/favorite_templates",
  "templates.custom_fields.get": "/accounts/{{accountId}}/templates/{{templateId}}/custom_fields",
  "templates.custom_fields.update": "/accounts/{{accountId}}/templates/{{templateId}}/custom_fields",
  "templates.document_fields.create": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/fields",
  "templates.document_fields.update": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/fields",
  "templates.document_fields.create_alias": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/fields",
  "templates.notification.get": "/accounts/{{accountId}}/templates/{{templateId}}/notification",
  "templates.notification.update": "/accounts/{{accountId}}/templates/{{templateId}}/notification",
  "templates.lock.get": "/accounts/{{accountId}}/templates/{{templateId}}/lock",
  "templates.lock.create": "/accounts/{{accountId}}/templates/{{templateId}}/lock",
  "templates.lock.update": "/accounts/{{accountId}}/templates/{{templateId}}/lock",
  "templates.lock.delete": "/accounts/{{accountId}}/templates/{{templateId}}/lock",
  "templates.views.edit.create": "/accounts/{{accountId}}/templates/{{templateId}}/views/edit",
  "templates.views.recipient_preview.create": "/accounts/{{accountId}}/templates/{{templateId}}/views/recipient_preview",
  "templates.workflow.get": "/accounts/{{accountId}}/templates/{{templateId}}/workflow",
  "templates.workflow.update": "/accounts/{{accountId}}/templates/{{templateId}}/workflow",
  "templates.workflow.delete": "/accounts/{{accountId}}/templates/{{templateId}}/workflow",
  "templates.workflow.steps.create": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/steps",
  "templates.workflow.steps.get": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/steps/{{workflowStepId}}",
  "templates.workflow.steps.update": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/steps/{{workflowStepId}}",
  "templates.workflow.steps.delete": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/steps/{{workflowStepId}}",
  "templates.workflow.delayed_routing.get": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/steps/{{workflowStepId}}/delayedRouting",
  "templates.workflow.delayed_routing.update": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/steps/{{workflowStepId}}/delayedRouting",
  "templates.workflow.delayed_routing.delete": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/steps/{{workflowStepId}}/delayedRouting",
  "templates.workflow.scheduled_sending.get": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/scheduledSending",
  "templates.workflow.scheduled_sending.update": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/scheduledSending",
  "templates.workflow.scheduled_sending.delete": "/accounts/{{accountId}}/templates/{{templateId}}/workflow/scheduledSending",
  "templates.document_visibility.get": "/accounts/{{accountId}}/templates/{{templateId}}/recipients/{{recipientId}}/document_visibility",
  "templates.document_visibility.update": "/accounts/{{accountId}}/templates/{{templateId}}/recipients/{{recipientId}}/document_visibility",
  "templates.document_visibility.update_all": "/accounts/{{accountId}}/templates/{{templateId}}/recipients/document_visibility",
  "templates.html_definitions.get": "/accounts/{{accountId}}/templates/{{templateId}}/html_definitions",
  "templates.document.html_definitions.get": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/html_definitions",
  "templates.responsive_html.create": "/accounts/{{accountId}}/templates/{{templateId}}/responsive_html_preview",
  "templates.document.responsive_html.create": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/responsive_html_preview",
  "templates.document.pages.delete": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/pages/{{pageNumber}}",
  "templates.groups.share": "/accounts/{{accountId}}/templates/{{templateId}}/{{templatePart}}",
  "templates.custom_fields.list_alias": "/accounts/{{accountId}}/templates/{{templateId}}/custom_fields",
  "envelopes.attachments.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/attachments",
  "envelopes.attachments.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/attachments/{{attachmentId}}",
  "envelopes.custom_fields.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/custom_fields",
  "envelopes.email_settings.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/email_settings",
  "envelopes.email_settings.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/email_settings",
  "envelopes.notification.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/notification",
  "envelopes.lock.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/lock",
  "envelopes.lock.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/lock",
  "envelopes.lock.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/lock",
  "envelopes.lock.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/lock",
  "envelopes.document_fields.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/fields",
  "envelopes.document_fields.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/fields",
  "envelopes.document_fields.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/fields",
  "envelopes.documents.templates.list": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/templates",
  "envelopes.documents.templates.apply": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/templates",
  "envelopes.documents.templates.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/templates/{{templateId}}",
  "envelopes.documents.pages.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/pages/{{pageNumber}}",
  "envelopes.html_definitions.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/html_definitions",
  "envelopes.document.html_definitions.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/html_definitions",
  "envelopes.responsive_html.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/responsive_html_preview",
  "envelopes.document.responsive_html.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/responsive_html_preview",
  "envelopes.docgen.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/docGenFormFields",
  "envelopes.docgen.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/docGenFormFields",
  "envelopes.recipients.disclosure.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/consumer_disclosure",
  "envelopes.recipients.document_visibility.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/document_visibility",
  "envelopes.recipients.document_visibility.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/document_visibility",
  "envelopes.document_visibility.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/document_visibility",
  "envelopes.recipients.identity_proof.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/identity_proof_token",
  "envelopes.recipients.signature.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/signature",
  "envelopes.views.shared.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/views/shared",
  "envelopes.views.identity_manual_review.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/views/identity_manual_review",
  "envelopes.views.correct.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/views/correct",
  "envelopes.workflow.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow",
  "envelopes.workflow.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow",
  "envelopes.workflow.steps.create": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/steps",
  "envelopes.workflow.steps.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/steps/{{workflowStepId}}",
  "envelopes.workflow.steps.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/steps/{{workflowStepId}}",
  "envelopes.workflow.steps.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/steps/{{workflowStepId}}",
  "envelopes.workflow.delayed_routing.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/steps/{{workflowStepId}}/delayedRouting",
  "envelopes.workflow.delayed_routing.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/steps/{{workflowStepId}}/delayedRouting",
  "envelopes.workflow.delayed_routing.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/steps/{{workflowStepId}}/delayedRouting",
  "envelopes.workflow.scheduled_sending.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/scheduledSending",
  "envelopes.workflow.scheduled_sending.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/scheduledSending",
  "envelopes.workflow.scheduled_sending.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/workflow/scheduledSending",
  "envelopes.transfer_rules.list": "/accounts/{{accountId}}/envelopes/transfer_rules",
  "envelopes.transfer_rules.delete": "/accounts/{{accountId}}/envelopes/transfer_rules/{{envelopeTransferRuleId}}",
  "envelopes.default_disclosure.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/consumer_disclosure/{{langCode}}",
  "console.view.create": "/accounts/{{accountId}}/views/console",
  "workspaces.list": "/accounts/{{accountId}}/workspaces",
  "workspaces.create": "/accounts/{{accountId}}/workspaces",
  "workspaces.get": "/accounts/{{accountId}}/workspaces/{{workspaceId}}",
  "workspaces.update": "/accounts/{{accountId}}/workspaces/{{workspaceId}}",
  "workspaces.delete": "/accounts/{{accountId}}/workspaces/{{workspaceId}}",
  "workspaces.folders.get": "/accounts/{{accountId}}/workspaces/{{workspaceId}}/folders/{{folderId}}",
  "workspaces.files.update": "/accounts/{{accountId}}/workspaces/{{workspaceId}}/folders/{{folderId}}/files/{{fileId}}",
  "notary.get": "/current_user/notary",
  "notary.update": "/current_user/notary",
  "notary.register": "/current_user/notary",
  "notary.journals.list": "/current_user/notary/journals",
  "notary.jurisdictions.list": "/current_user/notary/jurisdictions",
  "notary.jurisdictions.create": "/current_user/notary/jurisdictions",
  "notary.jurisdictions.get": "/current_user/notary/jurisdictions/{{jurisdictionId}}",
  "notary.jurisdictions.update": "/current_user/notary/jurisdictions/{{jurisdictionId}}",
  "notary.jurisdictions.delete": "/current_user/notary/jurisdictions/{{jurisdictionId}}",
  "diagnostics.request_logs.list": "/diagnostics/request_logs",
  "diagnostics.request_logs.delete": "/diagnostics/request_logs",
  "diagnostics.settings.get": "/diagnostics/settings",
  "diagnostics.settings.update": "/diagnostics/settings",
  "envelopes.default_disclosure.list": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/consumer_disclosure",
  "chunked_uploads.create": "/accounts/{{accountId}}/chunked_uploads",
  "envelopes.page_image.rotate": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/pages/{{pageNumber}}/page_image",
  "templates.page_image.rotate": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/pages/{{pageNumber}}/page_image",
  "workspaces.file_pages.list": "/accounts/{{accountId}}/workspaces/{{workspaceId}}/folders/{{folderId}}/files/{{fileId}}/pages",
  "envelopes.documents.pages.list": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/pages",
  "templates.documents.pages.list": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/pages",
  "templates.document.responsive_html.preview": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/responsive_html_preview",
  "stamps.image.get": "/accounts/{{accountId}}/signatures/{{signatureId}}/{{imageType}}",
  "brands.logos.get": "/accounts/{{accountId}}/brands/{{brandId}}/logos/{{logoType}}",
  "envelopes.page_image.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/pages/{{pageNumber}}/page_image",
  "templates.page_image.get": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/pages/{{pageNumber}}/page_image",
  "envelopes.documents.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}",
  "templates.documents.get": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}",
  "envelopes.attachments.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/attachments/{{attachmentId}}",
  "envelopes.comments.transcript.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/comments/transcript",
  "diagnostics.request_logs.get": "/diagnostics/request_logs/{{requestLogId}}",
  "brands.file.get": "/accounts/{{accountId}}/brands/{{brandId}}/file",
  "brands.resources.get": "/accounts/{{accountId}}/brands/{{brandId}}/resources/{{resourceContentType}}",
  "workspaces.files.get": "/accounts/{{accountId}}/workspaces/{{workspaceId}}/folders/{{folderId}}/files/{{fileId}}",
  "users.profile.image.get": "/accounts/{{accountId}}/users/{{userId}}/profile/image",
  "users.signatures.image.get": "/accounts/{{accountId}}/users/{{userId}}/signatures/{{signatureId}}/{{imageType}}",
  "envelopes.recipients.signature_image.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/signature_image",
  "envelopes.recipients.initials_image.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/initials_image",
  "envelopes.tabs_blob.get": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/tabs_blob",
  "users.signatures.image.update": "/accounts/{{accountId}}/users/{{userId}}/signatures/{{signatureId}}/{{imageType}}",
  "users.profile.image.update": "/accounts/{{accountId}}/users/{{userId}}/profile/image",
  "envelopes.recipients.signature_image.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/signature_image",
  "envelopes.recipients.initials_image.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/recipients/{{recipientId}}/initials_image",
  "workspaces.files.create": "/accounts/{{accountId}}/workspaces/{{workspaceId}}/folders/{{folderId}}/files",
  "brands.delete_many": "/accounts/{{accountId}}/brands",
  "groups.brands.delete": "/accounts/{{accountId}}/groups/{{groupId}}/brands",
  "envelopes.document_fields.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/documents/{{documentId}}/fields",
  "templates.document_fields.delete": "/accounts/{{accountId}}/templates/{{templateId}}/documents/{{documentId}}/fields",
  "templates.custom_fields.delete": "/accounts/{{accountId}}/templates/{{templateId}}/custom_fields",
  "users.custom_settings.delete": "/accounts/{{accountId}}/users/{{userId}}/custom_settings",
  "envelopes.attachments.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/attachments",
  "envelopes.custom_fields.delete": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/custom_fields",
  "signing_groups.users.delete": "/accounts/{{accountId}}/signing_groups/{{signingGroupId}}/users",
  "contacts.delete_many": "/accounts/{{accountId}}/contacts",
  "signing_groups.delete": "/accounts/{{accountId}}/signing_groups",
  "groups.users.delete": "/accounts/{{accountId}}/groups/{{groupId}}/users",
  "users.authorizations.delete_many": "/accounts/{{accountId}}/users/{{userId}}/authorizations",
  "cloud_storage.delete_many": "/accounts/{{accountId}}/users/{{userId}}/cloud_storage",
  "groups.delete": "/accounts/{{accountId}}/groups",
  "workspaces.items.delete": "/accounts/{{accountId}}/workspaces/{{workspaceId}}/folders/{{folderId}}",
  "templates.favorites.delete": "/accounts/{{accountId}}/favorite_templates",
  "templates.groups.unshare": "/accounts/{{accountId}}/templates/{{templateId}}/{{templatePart}}",
  "envelopes.tabs_blob.update": "/accounts/{{accountId}}/envelopes/{{envelopeId}}/tabs_blob"
} as Record<string, string>;
const METHODS = {
  "healthcheck": "GET",
  "userinfo.get": "GET",
  "service.get": "GET",
  "accounts.get": "GET",
  "accounts.settings.get": "GET",
  "accounts.billing_charges.list": "GET",
  "accounts.custom_fields.list": "GET",
  "accounts.recipient_names.get": "GET",
  "brands.list": "GET",
  "groups.list": "GET",
  "signing_groups.list": "GET",
  "signing_groups.get": "GET",
  "signing_groups.create": "POST",
  "signing_groups.users.list": "GET",
  "users.list": "GET",
  "users.get": "GET",
  "users.create": "POST",
  "users.settings.get": "GET",
  "users.profile.get": "GET",
  "templates.list": "GET",
  "templates.get": "GET",
  "templates.favorites.list": "GET",
  "envelopes.create": "POST",
  "envelopes.create_from_template": "POST",
  "envelopes.send": "PUT",
  "envelopes.get": "GET",
  "envelopes.audit_events.list": "GET",
  "envelopes.form_data.get": "GET",
  "envelopes.custom_fields.get": "GET",
  "envelopes.custom_fields.create": "POST",
  "envelopes.email_settings.get": "GET",
  "envelopes.email_settings.update": "PUT",
  "envelopes.notification.get": "GET",
  "envelopes.attachments.list": "GET",
  "envelopes.templates.list": "GET",
  "envelopes.templates.apply": "POST",
  "envelopes.workflow.get": "GET",
  "envelopes.views.recipient.create": "POST",
  "envelopes.views.sender.create": "POST",
  "envelopes.views.edit.create": "POST",
  "envelopes.views.correct.create": "POST",
  "envelopes.views.recipient_preview.create": "POST",
  "connect.list": "GET",
  "envelopes.list": "GET",
  "envelopes.recipients.list": "GET",
  "envelopes.documents.list": "GET",
  "folders.list": "GET",
  "powerforms.list": "GET",
  "contacts.create": "POST",
  "contacts.update": "PUT",
  "contacts.get": "GET",
  "contacts.delete": "DELETE",
  "brands.create": "POST",
  "brands.get": "GET",
  "brands.update": "PUT",
  "brands.delete": "DELETE",
  "brands.resources.list": "GET",
  "brands.logos.delete": "DELETE",
  "groups.brands.list": "GET",
  "groups.brands.update": "PUT",
  "bulk_send.batches.list": "GET",
  "bulk_send.batches.get": "GET",
  "bulk_send.batches.update": "PUT",
  "bulk_send.batches.action": "PUT",
  "bulk_send.lists.list": "GET",
  "bulk_send.lists.delete": "DELETE",
  "bulk_send.lists.send": "POST",
  "bulk_send.lists.test": "POST",
  "chunked_uploads.get": "GET",
  "chunked_uploads.commit": "PUT",
  "chunked_uploads.delete": "DELETE",
  "chunked_uploads.parts.add": "PUT",
  "connect.create": "POST",
  "connect.update": "PUT",
  "connect.get": "GET",
  "connect.delete": "DELETE",
  "connect.users.list": "GET",
  "connect.users.list_all": "GET",
  "connect.retry.envelope": "PUT",
  "connect.retry.envelopes": "PUT",
  "connect.publish.historical": "POST",
  "connect.failures.list": "GET",
  "connect.failures.delete": "DELETE",
  "connect.logs.list": "GET",
  "connect.logs.delete_all": "DELETE",
  "connect.logs.get": "GET",
  "connect.logs.delete": "DELETE",
  "connect.oauth.get": "GET",
  "connect.oauth.create": "POST",
  "connect.oauth.update": "PUT",
  "connect.oauth.delete": "DELETE",
  "accounts.custom_fields.create": "POST",
  "accounts.custom_fields.update": "PUT",
  "accounts.custom_fields.delete": "DELETE",
  "accounts.settings.update": "PUT",
  "accounts.password_rules.get": "GET",
  "accounts.password_rules.update": "PUT",
  "accounts.notification_defaults.get": "GET",
  "accounts.notification_defaults.update": "PUT",
  "accounts.tab_settings.get": "GET",
  "accounts.tab_settings.update": "PUT",
  "accounts.purge.get": "GET",
  "accounts.purge.update": "PUT",
  "accounts.consumer_disclosure.get": "GET",
  "accounts.consumer_disclosure.update": "PUT",
  "accounts.unsupported_file_types.list": "GET",
  "accounts.supported_languages.list": "GET",
  "accounts.seal_providers.list": "GET",
  "accounts.signature_providers.list": "GET",
  "accounts.identity_verification.list": "GET",
  "accounts.watermark.get": "GET",
  "accounts.watermark.update": "PUT",
  "accounts.watermark.preview": "PUT",
  "accounts.shared_access.get": "GET",
  "accounts.shared_access.update": "PUT",
  "accounts.delete": "DELETE",
  "accounts.provisioning.get": "GET",
  "resource.get": "GET",
  "bcc_email_archives.list": "GET",
  "bcc_email_archives.create": "POST",
  "bcc_email_archives.history.get": "GET",
  "bcc_email_archives.delete": "DELETE",
  "enote.get": "GET",
  "enote.update": "PUT",
  "enote.delete": "DELETE",
  "groups.create": "POST",
  "groups.update": "PUT",
  "groups.users.list": "GET",
  "groups.users.add": "PUT",
  "permission_profiles.list": "GET",
  "permission_profiles.create": "POST",
  "permission_profiles.get": "GET",
  "permission_profiles.update": "PUT",
  "permission_profiles.delete": "DELETE",
  "signing_groups.update": "PUT",
  "signing_groups.update_names": "PUT",
  "signing_groups.users.add": "PUT",
  "users.update": "PUT",
  "users.change": "PUT",
  "users.close": "PUT",
  "users.settings.update": "PUT",
  "users.profile.update": "PUT",
  "users.profile.image.delete": "DELETE",
  "users.custom_settings.get": "GET",
  "users.custom_settings.update": "PUT",
  "users.signatures.list": "GET",
  "users.signatures.update": "PUT",
  "users.signatures.get": "GET",
  "users.signatures.update_by_id": "PUT",
  "users.signatures.delete": "DELETE",
  "users.signatures.image.delete": "DELETE",
  "users.authorizations.create": "POST",
  "users.authorizations.get": "GET",
  "users.authorizations.update": "PUT",
  "users.authorizations.delete": "DELETE",
  "users.authorizations.list": "GET",
  "users.authorizations.create_many": "POST",
  "users.authorizations.agent.list": "GET",
  "captive_recipients.delete": "DELETE",
  "cloud_storage.list": "GET",
  "cloud_storage.create": "POST",
  "cloud_storage.get": "GET",
  "cloud_storage.delete": "DELETE",
  "cloud_storage.folders.list": "GET",
  "cloud_storage.folders.get": "GET",
  "stamps.list": "GET",
  "stamps.create": "POST",
  "stamps.update": "PUT",
  "stamps.get": "GET",
  "stamps.update_by_id": "PUT",
  "stamps.delete": "DELETE",
  "stamps.image.delete": "DELETE",
  "custom_tabs.list": "GET",
  "custom_tabs.create": "POST",
  "custom_tabs.get": "GET",
  "custom_tabs.update": "PUT",
  "custom_tabs.delete": "DELETE",
  "billing.invoices.list": "GET",
  "billing.invoices.get": "GET",
  "billing.invoices.past_due.list": "GET",
  "billing.payments.list": "GET",
  "billing.payments.create": "POST",
  "billing.payments.get": "GET",
  "billing.plan.get": "GET",
  "billing.plan.update": "PUT",
  "billing.credit_card.get": "GET",
  "billing.downgrade.get": "GET",
  "billing.downgrade.update": "PUT",
  "billing.purchased_envelopes.update": "PUT",
  "billing.plans.list": "GET",
  "payment_gateways.list": "GET",
  "powerforms.get": "GET",
  "powerforms.delete": "DELETE",
  "powerforms.form_data.get": "GET",
  "powerforms.senders.list": "GET",
  "folders.get": "GET",
  "folders.update": "PUT",
  "templates.favorites.add": "PUT",
  "templates.custom_fields.get": "GET",
  "templates.custom_fields.update": "PUT",
  "templates.document_fields.create": "POST",
  "templates.document_fields.update": "PUT",
  "templates.document_fields.create_alias": "POST",
  "templates.notification.get": "GET",
  "templates.notification.update": "PUT",
  "templates.lock.get": "GET",
  "templates.lock.create": "POST",
  "templates.lock.update": "PUT",
  "templates.lock.delete": "DELETE",
  "templates.views.edit.create": "POST",
  "templates.views.recipient_preview.create": "POST",
  "templates.workflow.get": "GET",
  "templates.workflow.update": "PUT",
  "templates.workflow.delete": "DELETE",
  "templates.workflow.steps.create": "POST",
  "templates.workflow.steps.get": "GET",
  "templates.workflow.steps.update": "PUT",
  "templates.workflow.steps.delete": "DELETE",
  "templates.workflow.delayed_routing.get": "GET",
  "templates.workflow.delayed_routing.update": "PUT",
  "templates.workflow.delayed_routing.delete": "DELETE",
  "templates.workflow.scheduled_sending.get": "GET",
  "templates.workflow.scheduled_sending.update": "PUT",
  "templates.workflow.scheduled_sending.delete": "DELETE",
  "templates.document_visibility.get": "GET",
  "templates.document_visibility.update": "PUT",
  "templates.document_visibility.update_all": "PUT",
  "templates.html_definitions.get": "GET",
  "templates.document.html_definitions.get": "GET",
  "templates.responsive_html.create": "POST",
  "templates.document.responsive_html.create": "POST",
  "templates.document.pages.delete": "DELETE",
  "templates.groups.share": "PUT",
  "templates.custom_fields.list_alias": "GET",
  "envelopes.attachments.create": "PUT",
  "envelopes.attachments.update": "PUT",
  "envelopes.custom_fields.update": "PUT",
  "envelopes.email_settings.delete": "DELETE",
  "envelopes.email_settings.create": "POST",
  "envelopes.notification.update": "PUT",
  "envelopes.lock.get": "GET",
  "envelopes.lock.create": "POST",
  "envelopes.lock.update": "PUT",
  "envelopes.lock.delete": "DELETE",
  "envelopes.document_fields.get": "GET",
  "envelopes.document_fields.create": "POST",
  "envelopes.document_fields.update": "PUT",
  "envelopes.documents.templates.list": "GET",
  "envelopes.documents.templates.apply": "POST",
  "envelopes.documents.templates.delete": "DELETE",
  "envelopes.documents.pages.delete": "DELETE",
  "envelopes.html_definitions.get": "GET",
  "envelopes.document.html_definitions.get": "GET",
  "envelopes.responsive_html.create": "POST",
  "envelopes.document.responsive_html.create": "POST",
  "envelopes.docgen.get": "GET",
  "envelopes.docgen.update": "PUT",
  "envelopes.recipients.disclosure.get": "GET",
  "envelopes.recipients.document_visibility.get": "GET",
  "envelopes.recipients.document_visibility.update": "PUT",
  "envelopes.document_visibility.update": "PUT",
  "envelopes.recipients.identity_proof.create": "POST",
  "envelopes.recipients.signature.get": "GET",
  "envelopes.views.shared.create": "POST",
  "envelopes.views.identity_manual_review.create": "POST",
  "envelopes.views.correct.delete": "DELETE",
  "envelopes.workflow.update": "PUT",
  "envelopes.workflow.delete": "DELETE",
  "envelopes.workflow.steps.create": "POST",
  "envelopes.workflow.steps.get": "GET",
  "envelopes.workflow.steps.update": "PUT",
  "envelopes.workflow.steps.delete": "DELETE",
  "envelopes.workflow.delayed_routing.get": "GET",
  "envelopes.workflow.delayed_routing.update": "PUT",
  "envelopes.workflow.delayed_routing.delete": "DELETE",
  "envelopes.workflow.scheduled_sending.get": "GET",
  "envelopes.workflow.scheduled_sending.update": "PUT",
  "envelopes.workflow.scheduled_sending.delete": "DELETE",
  "envelopes.transfer_rules.list": "GET",
  "envelopes.transfer_rules.delete": "DELETE",
  "envelopes.default_disclosure.get": "GET",
  "console.view.create": "POST",
  "workspaces.list": "GET",
  "workspaces.create": "POST",
  "workspaces.get": "GET",
  "workspaces.update": "PUT",
  "workspaces.delete": "DELETE",
  "workspaces.folders.get": "GET",
  "workspaces.files.update": "PUT",
  "notary.get": "GET",
  "notary.update": "PUT",
  "notary.register": "POST",
  "notary.journals.list": "GET",
  "notary.jurisdictions.list": "GET",
  "notary.jurisdictions.create": "POST",
  "notary.jurisdictions.get": "GET",
  "notary.jurisdictions.update": "PUT",
  "notary.jurisdictions.delete": "DELETE",
  "diagnostics.request_logs.list": "GET",
  "diagnostics.request_logs.delete": "DELETE",
  "diagnostics.settings.get": "GET",
  "diagnostics.settings.update": "PUT",
  "envelopes.default_disclosure.list": "GET",
  "chunked_uploads.create": "POST",
  "envelopes.page_image.rotate": "PUT",
  "templates.page_image.rotate": "PUT",
  "workspaces.file_pages.list": "GET",
  "envelopes.documents.pages.list": "GET",
  "templates.documents.pages.list": "GET",
  "templates.document.responsive_html.preview": "POST",
  "stamps.image.get": "GET",
  "brands.logos.get": "GET",
  "envelopes.page_image.get": "GET",
  "templates.page_image.get": "GET",
  "envelopes.documents.get": "GET",
  "templates.documents.get": "GET",
  "envelopes.attachments.get": "GET",
  "envelopes.comments.transcript.get": "GET",
  "diagnostics.request_logs.get": "GET",
  "brands.file.get": "GET",
  "brands.resources.get": "GET",
  "workspaces.files.get": "GET",
  "users.profile.image.get": "GET",
  "users.signatures.image.get": "GET",
  "envelopes.recipients.signature_image.get": "GET",
  "envelopes.recipients.initials_image.get": "GET",
  "envelopes.tabs_blob.get": "GET",
  "users.signatures.image.update": "PUT",
  "users.profile.image.update": "PUT",
  "envelopes.recipients.signature_image.update": "PUT",
  "envelopes.recipients.initials_image.update": "PUT",
  "workspaces.files.create": "POST",
  "brands.delete_many": "DELETE",
  "groups.brands.delete": "DELETE",
  "envelopes.document_fields.delete": "DELETE",
  "templates.document_fields.delete": "DELETE",
  "templates.custom_fields.delete": "DELETE",
  "users.custom_settings.delete": "DELETE",
  "envelopes.attachments.delete": "DELETE",
  "envelopes.custom_fields.delete": "DELETE",
  "signing_groups.users.delete": "DELETE",
  "contacts.delete_many": "DELETE",
  "signing_groups.delete": "DELETE",
  "groups.users.delete": "DELETE",
  "users.authorizations.delete_many": "DELETE",
  "cloud_storage.delete_many": "DELETE",
  "groups.delete": "DELETE",
  "workspaces.items.delete": "DELETE",
  "templates.favorites.delete": "DELETE",
  "templates.groups.unshare": "DELETE",
  "envelopes.tabs_blob.update": "PUT"
} as Record<string, string>;
const compiled = compileDeclarativeConnector(manifest as never);

function actionFor(key: string) {
  const operation = operations[key]!;
  if (typeof operation.transport === "string") {
    return (input: Record<string, unknown>) => executeTransport(key, input);
  }
  return compiled.actions[key]!;
}

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

describe("docusign manifest", () => {
  test("has tenant REST host, oauth hosts, version, and compiles", () => {
    expect(manifest.key).toBe("docusign");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.network.allowedHosts).toEqual(["{{restHost}}", "{{oauthHost}}", "account.docusign.com", "account-d.docusign.com"]);
    expect(manifest.http.baseUrl).toBe("https://{{restHost}}/restapi/v2.1");
    expect(manifest.http.auth.field).toBe("accessToken");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.oauth.authorizeUrl).toBe("https://account.docusign.com/oauth/auth");
    expect(manifest.auth.oauth.tokenUrl).toBe("https://account.docusign.com/oauth/token");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("covers mapped Composio DOCUSIGN tools with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS).length).toBe(338);
    expect(Object.keys(operations).length).toBe(351);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(operations["envelopes.create"]).toBeDefined();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
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
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented eSignature REST paths", () => {
    expect(requestOf("healthcheck").path).toBe("/login_information");
    expect(requestOf("userinfo.get").path).toBe("/oauth/userinfo");
    expect(requestOf("userinfo.get").baseUrl).toBe("https://{{oauthHost}}");
    expect(requestOf("service.get").path).toBe("/service_information");
    expect(requestOf("service.get").baseUrl).toBe("https://{{restHost}}/restapi");
    expect(requestOf("envelopes.get").path).toBe("/accounts/{{accountId}}/envelopes/{{envelopeId}}");
    expect(requestOf("envelopes.create").path).toBe("/accounts/{{accountId}}/envelopes");
    expect(requestOf("envelopes.create_from_template").path).toBe("/accounts/{{accountId}}/envelopes");
    expect(requestOf("envelopes.send").method).toBe("PUT");
    expect((requestOf("envelopes.send").body as { status: string }).status).toBe("sent");
    expect(requestOf("envelopes.views.recipient.create").path).toBe("/accounts/{{accountId}}/envelopes/{{envelopeId}}/views/recipient");
    expect(requestOf("templates.list").path).toBe("/accounts/{{accountId}}/templates");
    expect(requestOf("templates.favorites.list").path).toBe("/accounts/{{accountId}}/favorite_templates");
    expect((requestOf("templates.list").query as Record<string, string>).search_text).toBe("{{search_text}}");
    expect(requestOf("envelopes.list").path).toBe("/accounts/{{accountId}}/envelopes");
    expect(requestOf("connect.create").method).toBe("POST");
    expect(requestOf("bulk_send.lists.send").path).toBe("/accounts/{{accountId}}/bulk_send_lists/{{bulkSendListId}}/send");
  });
});

describe("docusign compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await actionFor(key)({
      accessToken: "dummy",
      restHost: "demo.docusign.net",
      oauthHost: "account-d.docusign.com",
      ...input,
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

  test("every operation dispatches a real HTTPS request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; baseUrl?: string };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      const host = new URL(requests[0]!.url).hostname;
      if (key === "userinfo.get") expect(host, key).toBe("account-d.docusign.com");
      else expect(host, key).toBe("demo.docusign.net");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      const transport = String(operation.transport ?? "");
      if (transport === "binary-get") expect(requests[0]!.headers.get("accept"), key).toBe("*/*");
      else expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "docusign", action: key, source: "provider" });
    }
  });

  test("healthcheck probes GET /login_information", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ loginAccount: [] }));
    expect(new URL(requests[0]!.url).pathname).toBe("/restapi/v2.1/login_information");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("templates.list", { accountId: "acct-1" }, () => jsonResponse({ envelopeTemplates: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://demo.docusign.net/restapi/v2.1/accounts/acct-1/templates");
    const filtered = await invoke(
      "templates.list",
      { accountId: "acct-1", count: "10", search_text: "NDA", user_filter: "owned_by_me" },
      () => jsonResponse({ envelopeTemplates: [] }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("count")).toBe("10");
    expect(url.searchParams.get("search_text")).toBe("NDA");
    expect(url.searchParams.get("user_filter")).toBe("owned_by_me");
  });

  test("create from template posts official camelCase JSON", async () => {
    const roles = [{ email: "signer@example.test", name: "Alex Signer", roleName: "Signer" }];
    const { requests } = await invoke(
      "envelopes.create_from_template",
      { accountId: "acct-1", templateId: "tmpl-1", emailSubject: "Please sign", status: "sent", templateRoles: roles },
      () => jsonResponse({ envelopeId: "env-1" }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/restapi/v2.1/accounts/acct-1/envelopes");
    expect(await requests[0]!.json()).toEqual({ templateId: "tmpl-1", emailSubject: "Please sign", status: "sent", templateRoles: roles });
  });

  test("send envelope PUTs status sent", async () => {
    const { requests } = await invoke(
      "envelopes.send",
      { accountId: "acct-1", envelopeId: "env-1" },
      () => jsonResponse({ envelopeId: "env-1", status: "sent" }),
    );
    expect(requests[0]!.method).toBe("PUT");
    expect(new URL(requests[0]!.url).pathname).toBe("/restapi/v2.1/accounts/acct-1/envelopes/env-1");
    expect(await requests[0]!.json()).toEqual({ status: "sent" });
  });

  test("oauth userinfo uses the OAuth host", async () => {
    const { requests } = await invoke("userinfo.get", {}, () => jsonResponse({ sub: "u-1" }));
    expect(requests[0]!.url).toBe("https://account-d.docusign.com/oauth/userinfo");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
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
      const action = actionFor(raw.operation);
      expect(action, raw.id).toBeTypeOf("function");
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = raw.exchanges[index++];
        if (!expected) throw new Error(`${raw.id}: extra request`);
        const url = String(input instanceof Request ? input.url : input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${raw.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const rawBody = init?.body == null ? null : String(init.body);
        const bodyIncludes = (expected.request as { bodyIncludesBase64?: string }).bodyIncludesBase64;
        if (expected.request.body === null) {
          if (typeof bodyIncludes === "string") {
            const needle = Buffer.from(bodyIncludes, "base64").toString("latin1");
            if (!(rawBody ?? "").includes(needle)) throw new Error(`${raw.id}: binary body missing payload`);
          } else if (rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${rawBody}`);
        } else if (typeof expected.request.body === "object") {
          if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, expected.request.body)) {
            throw new Error(`${raw.id}: body mismatch ${rawBody}`);
          }
        } else if (rawBody !== expected.request.body) {
          throw new Error(`${raw.id}: body mismatch ${rawBody}`);
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
