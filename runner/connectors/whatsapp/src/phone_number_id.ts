import { assertSafePathSegment } from "../../_shared/jobboard";

/**
 * phoneNumberIdSegment is the single guard for every WhatsApp URL built from a
 * phone number id, whether it arrives as caller input or as the phoneNumberId
 * setup field (actions, credentials.validate, healthcheck). Meta phone number
 * ids are opaque numeric strings; the strict segment charset (letters, digits,
 * '.', '_', '-', trimmed, never dot-only) rejects '..', '%2e%2e', ' .. ', '',
 * whitespace, '/', and '\' (which WHATWG URL parsing turns into '/'), so the id
 * can never collapse or split the /<version>/<phoneNumberId>/... path.
 */
export function phoneNumberIdSegment(value: unknown): string {
  if (typeof value !== "string") throw new Error("phoneNumberId is required");
  return assertSafePathSegment(value, "phoneNumberId");
}
