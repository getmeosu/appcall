import { assertHostLabel } from "../../_shared/jobboard";

/**
 * SEC-PATH-2c-2: the `host` setup field is also substituted into the outbound
 * allowlist (`{{host}}`), so an unchecked value let '.', '..' or 'a.evil.example'
 * pick the request host. It must be `<label>.api.mailchimp.com`, where the data
 * center label passes the same RFC 1123 check as zendesk subdomain and workable
 * account (assertHostLabel). No scheme, path, port, userinfo or extra labels.
 */
export function assertMailchimpHost(value: unknown, field = "host"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${field} is required` };
  }
  const match = /^([^.]*)\.api\.mailchimp\.com$/i.exec(value.trim());
  if (!match) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${field} must be a Mailchimp API host like us1.api.mailchimp.com (no scheme or path)` };
  }
  return `${assertHostLabel(match[1], field)}.api.mailchimp.com`;
}
