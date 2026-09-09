/**
 * Minimal CalDAV XML builder and tolerant response parser.
 * Uses regex/string-based extraction — no external XML DOM dependency.
 */

// ─── XML Builder ──────────────────────────────────────────────────────────────

/** Build a PROPFIND XML body that requests current-user-principal. */
export function buildPrincipalPropfind(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>`;
}

/** Build a PROPFIND XML body that requests calendar-home-set. */
export function buildCalendarHomePropfind(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>`;
}

/** Build a PROPFIND XML body for listing calendars (Depth:1). */
export function buildCalendarListPropfind(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:APPLE="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <C:supported-calendar-component-set/>
    <CS:getctag/>
    <APPLE:calendar-color/>
  </D:prop>
</D:propfind>`;
}

/** Build a REPORT XML body for calendar-query (list events, optionally time-filtered). */
export function buildCalendarQueryReport(start?: string, end?: string): string {
  const normalizedStart = start === undefined ? undefined : toCalDAVDateTime(start);
  const normalizedEnd = end === undefined ? undefined : toCalDAVDateTime(end);
  const timeRange = (normalizedStart !== undefined && normalizedEnd !== undefined)
    ? `\n      <C:time-range start="${normalizedStart}" end="${normalizedEnd}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">${timeRange}
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;
}

/** Build a REPORT XML body for free-busy-query. */
export function buildFreeBusyReport(start: string, end: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<C:free-busy-query xmlns:C="urn:ietf:params:xml:ns:caldav">
  <C:time-range start="${toCalDAVDateTime(start)}" end="${toCalDAVDateTime(end)}"/>
</C:free-busy-query>`;
}

const STRICT_ISO_DATE_TIME = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?<fraction>\.\d{1,9})?(?<offset>Z|[+-]\d{2}:\d{2})?$/;

function invalidCalDavDateTime(): never {
  throw new Error("Invalid CalDAV date-time.");
}

function invalidCalDavTimezone(): never {
  throw new Error("Invalid CalDAV timezone.");
}

/** Validate a Temporal timezone without allowing it to reinterpret an offset timestamp. */
function validateCalDavTimezone(timezone: string): void {
  if (timezone.length === 0) invalidCalDavTimezone();
  try {
    Temporal.Instant.from("2000-01-01T00:00:00Z").toZonedDateTimeISO(timezone);
  } catch {
    invalidCalDavTimezone();
  }
}

function padCalDavPart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatCalDavInstant(instant: Temporal.Instant): string {
  const utc = instant.toZonedDateTimeISO("UTC");
  if (utc.year < 1 || utc.year > 9999) invalidCalDavDateTime();
  return `${String(utc.year).padStart(4, "0")}${padCalDavPart(utc.month)}${padCalDavPart(utc.day)}T${padCalDavPart(utc.hour)}${padCalDavPart(utc.minute)}${padCalDavPart(utc.second)}Z`;
}

/** Convert a strict ISO date-time to a canonical UTC CalDAV date-time. */
export function toCalDAVDateTime(iso: string, timezone?: string): string {
  if (typeof iso !== "string") invalidCalDavDateTime();
  const match = STRICT_ISO_DATE_TIME.exec(iso);
  if (!match?.groups) invalidCalDavDateTime();

  const year = Number(match.groups.year);
  if (year < 1 || year > 9999) invalidCalDavDateTime();
  if (Number(match.groups.second) > 59) invalidCalDavDateTime();

  if (timezone !== undefined) {
    if (typeof timezone !== "string") invalidCalDavTimezone();
    validateCalDavTimezone(timezone);
  }

  try {
    const instant = match.groups.offset
      ? Temporal.Instant.from(iso)
      : Temporal.ZonedDateTime.from(
        {
          year,
          month: Number(match.groups.month),
          day: Number(match.groups.day),
          hour: Number(match.groups.hour),
          minute: Number(match.groups.minute),
          second: Number(match.groups.second),
          millisecond: 0,
          microsecond: 0,
          nanosecond: 0,
          timeZone: timezone ?? "UTC",
        },
        { overflow: "reject", disambiguation: "reject" },
      ).toInstant();
    return formatCalDavInstant(instant);
  } catch {
    invalidCalDavDateTime();
  }
}

// ─── Tolerant XML Response Parser ─────────────────────────────────────────────

export type ParsedResponse = {
  /** All <D:href> values found in the multistatus response */
  hrefs: string[];
  /** Per-href properties extracted */
  responses: ParsedDavResponse[];
};

export type ParsedDavResponse = {
  href: string;
  displayName?: string;
  etag?: string;
  calendarData?: string;
  calendarColor?: string;
  components?: string[]; // e.g. ["VEVENT"]
  ctag?: string;
  isCalendar?: boolean;
  principalHref?: string;
  calendarHomeHref?: string;
};

/** Extract text between a tag (handles namespace prefixes like D:, C:, etc.) */
function extractTag(xml: string, localName: string): string | undefined {
  // Match tags like <D:displayname>, <displayname>, etc.
  const re = new RegExp(`<[^:>]*:?${localName}[^>]*>([\\s\\S]*?)<\/[^:>]*:?${localName}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : undefined;
}

/** Decode standard XML entities in ETag text without recursively decoding values. */
function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|quot|apos|amp|lt|gt);/gi, (entity, name: string) => {
    const normalized = name.toLowerCase();
    if (normalized === "quot") return '"';
    if (normalized === "apos") return "'";
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";

    const codePoint = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

/** Extract all occurrences of a tag value */
function extractAllTags(xml: string, localName: string): string[] {
  const re = new RegExp(`<[^:>]*:?${localName}[^>]*>([\\s\\S]*?)<\/[^:>]*:?${localName}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

/** Extract href from <D:href>...</D:href> */
function extractHref(block: string): string | undefined {
  return extractTag(block, "href");
}

/** Split multistatus XML into per-response blocks */
function splitResponses(xml: string): string[] {
  const re = /<[^:>]*:?response[^>]*>([\s\S]*?)<\/[^:>]*:?response>/gi;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

/** Parse supported-calendar-component-set to extract component names */
function parseComponents(block: string): string[] {
  const re = /<[^:>]*:?comp[^>]+name="([^"]+)"/gi;
  const components: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    components.push(m[1]);
  }
  return components;
}

/** Check if a response block contains a calendar resource type */
function isCalendarResourceType(block: string): boolean {
  return /calendar/i.test(block) && /<[^:>]*:?resourcetype/i.test(block);
}

/** Parse a full multi-status XML body into structured responses */
export function parseMultiStatus(xml: string): ParsedResponse {
  const blocks = splitResponses(xml);
  const responses: ParsedDavResponse[] = [];

  for (const block of blocks) {
    const href = extractHref(block) ?? "";
    const displayName = extractTag(block, "displayname");
    const etag = extractTag(block, "getetag");
    const calendarData = extractTag(block, "calendar-data");
    const calendarColor = extractTag(block, "calendar-color");
    const ctag = extractTag(block, "getctag");
    const components = parseComponents(block);
    const isCalendar = isCalendarResourceType(block);

    // Extract principal href from current-user-principal
    const principalBlock = extractTag(block, "current-user-principal");
    const principalHref = principalBlock ? extractHref(principalBlock) : undefined;

    // Extract calendar-home-set href
    const calHomeBlock = extractTag(block, "calendar-home-set");
    const calendarHomeHref = calHomeBlock ? extractHref(calHomeBlock) : undefined;

    responses.push({
      href,
      displayName,
      etag: etag ? decodeXmlText(etag) : undefined,
      calendarData,
      calendarColor,
      components: components.length > 0 ? components : undefined,
      ctag,
      isCalendar,
      principalHref,
      calendarHomeHref,
    });
  }

  return {
    hrefs: responses.map((r) => r.href),
    responses,
  };
}

// ─── iCalendar (VEVENT) Helpers ───────────────────────────────────────────────

export type VEventInput = {
  uid: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  timezone?: string;
  attendees?: string[];
};

export type ParsedVEvent = {
  uid?: string;
  summary?: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
};

/** Build a full VCALENDAR/VEVENT iCalendar string */
export function buildVEvent(input: VEventInput): string {
  const now = toCalDAVDateTime(Temporal.Now.instant().toString());
  const dtstart = toCalDAVDateTime(input.start, input.timezone);
  const dtend = toCalDAVDateTime(input.end, input.timezone);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CalDAV Connector//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${foldICalLine(input.summary)}`,
  ];

  if (input.description) {
    lines.push(`DESCRIPTION:${foldICalLine(input.description)}`);
  }
  if (input.location) {
    lines.push(`LOCATION:${foldICalLine(input.location)}`);
  }
  if (input.attendees) {
    for (const att of input.attendees) {
      lines.push(`ATTENDEE:mailto:${att}`);
    }
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Fold long iCalendar property values (basic — escape special chars) */
function foldICalLine(value: string): string {
  // Escape commas and semicolons per RFC 5545
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

/** Parse key fields from a VEVENT string */
export function parseVEvent(icsData: string): ParsedVEvent {
  const getField = (field: string): string | undefined => {
    const re = new RegExp(`^${field}(?:;[^:]*)?:(.+)$`, "m");
    const m = icsData.match(re);
    return m ? unfoldICalLine(m[1].trim()) : undefined;
  };

  return {
    uid: getField("UID"),
    summary: getField("SUMMARY"),
    start: getField("DTSTART"),
    end: getField("DTEND"),
    location: getField("LOCATION"),
    description: getField("DESCRIPTION"),
  };
}

/** Unescape iCalendar line values */
function unfoldICalLine(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Generate a simple UUID-like string */
export function generateUid(): string {
  const rand = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `${rand()}-${rand().slice(0, 4)}-${rand().slice(0, 4)}-${rand().slice(0, 4)}-${rand()}`;
}
