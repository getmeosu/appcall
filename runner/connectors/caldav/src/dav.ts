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
const NUMERIC_TIMEZONE_IDENTIFIER = /^[+-]\d{2}(?::?\d{2})?$/;

function invalidCalDavDateTime(): never {
  throw new Error("Invalid CalDAV date-time.");
}

function invalidCalDavTimezone(): never {
  throw new Error("Invalid CalDAV timezone.");
}

/** Validate a Temporal timezone without allowing it to reinterpret an offset timestamp. */
function validateCalDavTimezone(timezone: string): void {
  if (timezone.length === 0) invalidCalDavTimezone();
  if (NUMERIC_TIMEZONE_IDENTIFIER.test(timezone)) invalidCalDavTimezone();
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
  validateVEventInput(input);
  const now = toCalDAVDateTime(Temporal.Now.instant().toString());
  const dtstart = toCalDAVDateTime(input.start, input.timezone);
  const dtend = toCalDAVDateTime(input.end, input.timezone);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CalDAV Connector//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${foldICalLine(input.uid)}`,
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
      lines.push(`ATTENDEE:mailto:${normalizeCalendarAddress(att)}`);
    }
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Fold long iCalendar property values (basic — escape special chars) */
function foldICalLine(value: string): string {
  assertSafeText(value);
  // Escape commas and semicolons per RFC 5545
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function assertSafeText(value: string): void {
  if (/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error("iCalendar text must not contain line breaks or control characters.");
  }
}

function validateVEventInput(input: VEventInput): void {
  if (typeof input.uid !== "string" || input.uid.length === 0) {
    throw new Error("uid is required");
  }
  if (typeof input.summary !== "string") {
    throw new Error("summary is required");
  }
  assertSafeText(input.uid);
  if (/\r|\n/.test(input.uid)) {
    throw new Error("iCalendar UID must not contain line breaks.");
  }
  assertSafeText(input.summary);
  if (input.description !== undefined) assertSafeText(input.description);
  if (input.location !== undefined) assertSafeText(input.location);
  if (input.attendees !== undefined) {
    for (const attendee of input.attendees) normalizeCalendarAddress(attendee);
  }
}

function normalizeCalendarAddress(value: string): string {
  if (typeof value !== "string") throw new Error("attendee must be a valid calendar address.");
  assertSafeText(value);
  const address = value.replace(/^mailto:/i, "");
  if (!/^[^@\s<>;,]+@[^@\s<>;,]+$/.test(address)) {
    throw new Error("attendee must be a valid calendar address.");
  }
  return address;
}

type ICalProperty = { name: string; prefix: string; start: number; end: number };

/**
 * Apply an update to the matching master VEVENT while retaining the original
 * calendar envelope, other VEVENTs, alarms, organizers, and unknown fields.
 * Ambiguous or malformed resources are rejected so a partial replacement can
 * never discard provider-owned data.
 */
export function mergeVEvent(calendarData: string, input: VEventInput): string {
  validateVEventInput(input);
  const dtstart = toCalDAVDateTime(input.start, input.timezone);
  const dtend = toCalDAVDateTime(input.end, input.timezone);
  const lines = splitCalendarLines(calendarData);
  validateComponentNesting(lines);
  const events = findVEventRanges(lines);
  for (const event of events) {
    if (directProperties(lines, event, "UID").length !== 1) {
      throw new Error("CalDAV event resource cannot be safely updated: VEVENT UID is missing or duplicated.");
    }
  }
  const matching = events.filter((event) => directPropertyValue(lines, event, "UID") === input.uid);
  const masters = matching.filter((event) => directProperty(lines, event, "RECURRENCE-ID") === undefined);
  if (masters.length !== 1) {
    throw new Error("CalDAV event resource cannot be safely updated: matching master VEVENT is missing or ambiguous.");
  }

  const event = masters[0];
  const eventLines = lines.slice(event.start + 1, event.end);
  replaceDirectProperty(eventLines, "SUMMARY", foldICalLine(input.summary));
  replaceDirectProperty(eventLines, "DTSTART", dtstart, true);
  removeDirectProperties(eventLines, "DURATION");
  replaceDirectProperty(eventLines, "DTEND", dtend, true);
  if (input.description !== undefined) replaceDirectProperty(eventLines, "DESCRIPTION", foldICalLine(input.description));
  if (input.location !== undefined) replaceDirectProperty(eventLines, "LOCATION", foldICalLine(input.location));
  if (input.attendees !== undefined) {
    removeDirectProperties(eventLines, "ATTENDEE");
    for (const attendee of input.attendees) {
      insertBeforeEnd(eventLines, `ATTENDEE:mailto:${normalizeCalendarAddress(attendee)}`);
    }
  }
  lines.splice(event.start + 1, event.end - event.start - 1, ...eventLines);
  return `${lines.join("\r\n")}\r\n`;
}

function splitCalendarLines(calendarData: string): string[] {
  if (typeof calendarData !== "string" || calendarData.length === 0) {
    throw new Error("CalDAV event resource cannot be safely updated: calendar data is empty.");
  }
  const normalized = calendarData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length < 4 || lines[0]?.toUpperCase() !== "BEGIN:VCALENDAR" || lines.at(-1)?.toUpperCase() !== "END:VCALENDAR") {
    throw new Error("CalDAV event resource cannot be safely updated: unsupported calendar structure.");
  }
  return lines;
}

function findVEventRanges(lines: string[]): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.toUpperCase();
    if (line === "BEGIN:VEVENT") {
      if (start !== undefined) throw new Error("CalDAV event resource cannot be safely updated: nested VEVENT.");
      start = index;
    } else if (line === "END:VEVENT") {
      if (start === undefined) throw new Error("CalDAV event resource cannot be safely updated: unmatched END:VEVENT.");
      ranges.push({ start, end: index });
      start = undefined;
    }
  }
  if (start !== undefined || ranges.length === 0) {
    throw new Error("CalDAV event resource cannot be safely updated: VEVENT is missing or incomplete.");
  }
  return ranges;
}

function validateComponentNesting(lines: string[]): void {
  const stack: string[] = [];
  for (const line of lines) {
    const begin = line.match(/^BEGIN:([^:;]+)$/i);
    if (begin) {
      stack.push(begin[1].toUpperCase());
      continue;
    }
    const end = line.match(/^END:([^:;]+)$/i);
    if (!end) continue;
    const expected = stack.pop();
    if (!expected || expected !== end[1].toUpperCase()) {
      throw new Error("CalDAV event resource cannot be safely updated: malformed component nesting.");
    }
  }
  if (stack.length !== 0) {
    throw new Error("CalDAV event resource cannot be safely updated: malformed component nesting.");
  }
}

function directProperty(lines: string[], range: { start: number; end: number }, name: string): ICalProperty | undefined {
  return directProperties(lines, range, name)[0];
}

function directProperties(lines: string[], range: { start: number; end: number }, name: string): ICalProperty[] {
  const eventLines = lines.slice(range.start + 1, range.end);
  return directPropertiesInBlock(eventLines, name).map((property) => ({
    ...property,
    start: property.start + range.start + 1,
    end: property.end + range.start + 1,
  }));
}

function directPropertyValue(lines: string[], range: { start: number; end: number }, name: string): string | undefined {
  const property = directProperty(lines, range, name);
  if (!property) return undefined;
  const unfolded = lines.slice(property.start, property.end).map((line, index) => index === 0 ? line : line.trimStart()).join("");
  const colon = unfolded.indexOf(":");
  return colon < 0 ? undefined : unfoldICalLine(unfolded.slice(colon + 1));
}

function directPropertyInBlock(lines: string[], name: string): ICalProperty | undefined {
  return directPropertiesInBlock(lines, name)[0];
}

function directPropertiesInBlock(lines: string[], name: string): ICalProperty[] {
  let componentDepth = 0;
  const properties: ICalProperty[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:")) {
      componentDepth += 1;
      continue;
    }
    if (upper.startsWith("END:")) {
      componentDepth = Math.max(0, componentDepth - 1);
      continue;
    }
    if (componentDepth !== 0 || line.startsWith(" ") || line.startsWith("\t")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const prefix = line.slice(0, colon);
    if (prefix.split(";", 1)[0]?.toUpperCase() !== name) continue;
    let end = index + 1;
    while (end < lines.length && /^[ \t]/.test(lines[end] ?? "")) end += 1;
    properties.push({ name, prefix, start: index, end });
    index = end - 1;
  }
  return properties;
}

function removeDirectProperties(lines: string[], name: string): void {
  for (;;) {
    const property = directPropertyInBlock(lines, name);
    if (!property) return;
    lines.splice(property.start, property.end - property.start);
  }
}

function replaceDirectProperty(lines: string[], name: string, value: string, replacePrefix = false): void {
  const property = directPropertyInBlock(lines, name);
  if (property) {
    lines.splice(property.start, property.end - property.start, `${replacePrefix ? name : property.prefix}:${value}`);
    return;
  }
  insertBeforeEnd(lines, `${name}:${value}`);
}

function insertBeforeEnd(lines: string[], line: string): void {
  const firstNestedComponent = lines.findIndex((candidate) => candidate.toUpperCase().startsWith("BEGIN:"));
  lines.splice(firstNestedComponent < 0 ? lines.length : firstNestedComponent, 0, line);
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
