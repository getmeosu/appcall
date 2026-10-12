import { assertHostLabel } from "../../_shared/jobboard";

/**
 * SEC-PATH-2c-2: the `host` setup field is also substituted into the outbound
 * allowlist (`{{host}}`), so an unchecked value let '.', '..' or 'a.evil.example'
 * pick the request host. It must name `<label>.api.mailchimp.com`, where the data
 * center label passes the same RFC 1123 check as zendesk subdomain and workable
 * account (assertHostLabel).
 *
 * Stored connections hold several spellings, so before the check a leading
 * `https://` (any case) and trailing slashes are stripped, and a bare data
 * center label (`us21`) is accepted alongside the full host. Nothing else is
 * rewritten: another scheme, a path, a port, userinfo or extra labels reject.
 */
export function assertMailchimpHost(value: unknown, field = "host"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${field} is required` };
  }
  const normalized = value.trim().replace(/^https:\/\//i, "").replace(/\/+$/, "");
  const label = normalized.includes(".")
    ? /^([^.]*)\.api\.mailchimp\.com$/i.exec(normalized)?.[1]
    : normalized;
  if (label === undefined) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${field} must be a Mailchimp API host like us1.api.mailchimp.com (no path or port)` };
  }
  return `${assertHostLabel(label, field)}.api.mailchimp.com`;
}
