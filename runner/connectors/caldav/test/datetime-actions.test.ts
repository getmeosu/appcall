import { expect, test } from "bun:test";
import { createEvent, listEvents, queryFreeBusy, updateEvent } from "../src/actions";

const eventsReportXml = await Bun.file(`${import.meta.dir}/../fixtures/events_report.xml`).text();
const CREDS = { username: "test@icloud.com", password: "app-password" };

type TransportDateCase = {
  name: string;
  start: string;
  end: string;
  timezone?: string;
  expectedStart: string;
  expectedEnd: string;
};

const TRANSPORT_DATE_CASES: TransportDateCase[] = [
  {
    name: "positive offset with fractional seconds",
    start: "2024-06-15T10:00:00.123456+05:30",
    end: "2024-06-15T11:00:00.654321+05:30",
    timezone: "America/New_York",
    expectedStart: "20240615T043000Z",
    expectedEnd: "20240615T053000Z",
  },
  {
    name: "negative offset with fractional seconds",
    start: "2024-06-15T10:00:00.123456-04:00",
    end: "2024-06-15T11:00:00.654321-04:00",
    timezone: "Asia/Kolkata",
    expectedStart: "20240615T140000Z",
    expectedEnd: "20240615T150000Z",
  },
  {
    name: "naive datetime in Asia/Kolkata",
    start: "2024-06-15T10:00:00",
    end: "2024-06-15T11:00:00",
    timezone: "Asia/Kolkata",
    expectedStart: "20240615T043000Z",
    expectedEnd: "20240615T053000Z",
  },
  {
    name: "naive datetime defaults to UTC",
    start: "2024-06-15T10:00:00",
    end: "2024-06-15T11:00:00",
    expectedStart: "20240615T100000Z",
    expectedEnd: "20240615T110000Z",
  },
];

const REPORT_OFFSET_CASES = TRANSPORT_DATE_CASES.slice(0, 2);

async function captureWriteBody(operation: "create" | "update", dates: TransportDateCase): Promise<string> {
  const requests: Request[] = [];
  const requestFetch: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return new Response("", { status: operation === "create" ? 201 : 204 });
  };
  const common = {
    ...CREDS,
    summary: "Transport datetime",
    start: dates.start,
    end: dates.end,
    timezone: dates.timezone,
    fetch: requestFetch,
  };

  if (operation === "create") {
    await createEvent({
      ...common,
      calendarHref: "/1234567890/calendars/home/",
      uid: "transport-create-001",
    });
  } else {
    await updateEvent({
      ...common,
      eventHref: "/1234567890/calendars/home/transport-update-001.ics",
      etag: '"transport-etag"',
      uid: "transport-update-001",
    });
  }

  expect(requests).toHaveLength(1);
  return requests[0]!.text();
}

async function captureReportBody(operation: "events.list" | "freebusy.query", dates: TransportDateCase): Promise<string> {
  const requests: Request[] = [];
  const requestFetch: typeof fetch = async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(eventsReportXml, { status: 207 });
  };

  if (operation === "events.list") {
    await listEvents({
      ...CREDS,
      calendarHref: "/1234567890/calendars/home/",
      start: dates.start,
      end: dates.end,
      fetch: requestFetch,
    });
  } else {
    await queryFreeBusy({
      ...CREDS,
      href: "/1234567890/calendars/home/",
      start: dates.start,
      end: dates.end,
      fetch: requestFetch,
    });
  }

  expect(requests).toHaveLength(1);
  return requests[0]!.text();
}

for (const operation of ["create", "update"] as const) {
  test(`${operation} normalizes strict ISO datetimes before PUT`, async () => {
    for (const dates of TRANSPORT_DATE_CASES) {
      const body = await captureWriteBody(operation, dates);
      expect(body).toContain(`DTSTART:${dates.expectedStart}`);
      expect(body).toContain(`DTEND:${dates.expectedEnd}`);
    }
  });
}

for (const operation of ["events.list", "freebusy.query"] as const) {
  test(`${operation} REPORT normalizes positive and negative offsets`, async () => {
    for (const dates of REPORT_OFFSET_CASES) {
      const body = await captureReportBody(operation, dates);
      expect(body).toContain(`start="${dates.expectedStart}"`);
      expect(body).toContain(`end="${dates.expectedEnd}"`);
    }
  });
}

const INVALID_WRITE_DATETIME_CASES: TransportDateCase[] = [
  {
    name: "malformed datetime",
    start: "not-a-date",
    end: "2024-06-15T11:00:00Z",
    expectedStart: "",
    expectedEnd: "",
  },
  {
    name: "unknown timezone",
    start: "2024-06-15T10:00:00",
    end: "2024-06-15T11:00:00",
    timezone: "Mars/Olympus",
    expectedStart: "",
    expectedEnd: "",
  },
  {
    name: "DST gap",
    start: "2024-03-10T02:30:00",
    end: "2024-03-10T03:30:00",
    timezone: "America/New_York",
    expectedStart: "",
    expectedEnd: "",
  },
  {
    name: "DST fold",
    start: "2024-11-03T01:30:00",
    end: "2024-11-03T02:30:00",
    timezone: "America/New_York",
    expectedStart: "",
    expectedEnd: "",
  },
];

for (const operation of ["create", "update"] as const) {
  for (const dates of INVALID_WRITE_DATETIME_CASES) {
    test(`${operation} rejects ${dates.name} before fetch`, async () => {
      let fetchCalls = 0;
      const requestFetch: typeof fetch = async () => {
        fetchCalls += 1;
        return new Response("", { status: operation === "create" ? 201 : 204 });
      };
      const common = {
        ...CREDS,
        summary: "Invalid transport datetime",
        start: dates.start,
        end: dates.end,
        timezone: dates.timezone,
        fetch: requestFetch,
      };

      const action = operation === "create"
        ? createEvent({ ...common, calendarHref: "/1234567890/calendars/home/", uid: "invalid-create-001" })
        : updateEvent({
          ...common,
          eventHref: "/1234567890/calendars/home/invalid-update-001.ics",
          etag: '"invalid-etag"',
          uid: "invalid-update-001",
        });

      await expect(action).rejects.toThrow();
      expect(fetchCalls).toBe(0);
    });
  }
}

for (const operation of ["events.list", "freebusy.query"] as const) {
  test(`${operation} rejects malformed REPORT datetime before fetch`, async () => {
    let fetchCalls = 0;
    const requestFetch: typeof fetch = async () => {
      fetchCalls += 1;
      return new Response(eventsReportXml, { status: 207 });
    };
    const action = operation === "events.list"
      ? listEvents({
        ...CREDS,
        calendarHref: "/1234567890/calendars/home/",
        start: "not-a-date",
        end: "2024-06-15T11:00:00Z",
        fetch: requestFetch,
      })
      : queryFreeBusy({
        ...CREDS,
        href: "/1234567890/calendars/home/",
        start: "not-a-date",
        end: "2024-06-15T11:00:00Z",
        fetch: requestFetch,
      });

    await expect(action).rejects.toThrow();
    expect(fetchCalls).toBe(0);
  });
}

const INVALID_LONE_REPORT_BOUNDS = [
  { name: "malformed lone start", start: "not-a-date" },
  { name: "malformed lone end", end: "not-a-date" },
  { name: "empty lone start", start: "" },
  { name: "empty lone end", end: "" },
];

for (const dates of INVALID_LONE_REPORT_BOUNDS) {
  test(`events.list rejects ${dates.name} before fetch`, async () => {
    let fetchCalls = 0;
    const requestFetch: typeof fetch = async () => {
      fetchCalls += 1;
      return new Response(eventsReportXml, { status: 207 });
    };
    const action = listEvents({
      ...CREDS,
      calendarHref: "/1234567890/calendars/home/",
      ...dates,
      fetch: requestFetch,
    });

    await expect(action).rejects.toThrow("Invalid CalDAV date-time.");
    expect(fetchCalls).toBe(0);
  });
}
