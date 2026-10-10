import { describe, expect, test } from "bun:test";
import { encodeStatuscakeForm, statuscakeFormHandlers } from "../src/actions";

describe("statuscake form handlers", () => {
  test("encodes StatusCake arrays as field[] and maps check_rate aliases", () => {
    const encoded = encodeStatuscakeForm({
      name: "Operations",
      email_addresses: ["ops@example.com", "oncall@example.com"],
      tags: ["prod", "web"],
      contact_groups: ["99"],
      check_rate: "every_5_minutes",
      paused: true,
      test_id: "12345",
    });
    const params = new URLSearchParams(encoded);
    expect(params.getAll("email_addresses[]")).toEqual(["ops@example.com", "oncall@example.com"]);
    expect(params.getAll("tags[]")).toEqual(["prod", "web"]);
    expect(params.getAll("contact_groups[]")).toEqual(["99"]);
    expect(params.get("check_rate")).toBe("300");
    expect(params.get("paused")).toBe("true");
    expect(params.get("name")).toBe("Operations");
    expect(params.has("test_id")).toBe(false);
  });

  test("sends contact group emails through the handwritten create handler", async () => {
    const fetchStub: typeof fetch = async (input, init) => {
      expect(String(input)).toBe("https://api.statuscake.com/v1/contact-groups");
      expect(String(init?.method)).toBe("POST");
      expect(String(init?.body)).toContain("email_addresses%5B%5D=ops%40example.com");
      expect(String(init?.body)).toContain("name=Operations");
      return new Response(JSON.stringify({ data: { new_id: "99" } }), { status: 201 });
    };
    const result = await statuscakeFormHandlers["contactGroups.create"]!({
      name: "Operations",
      email_addresses: ["ops@example.com"],
      apiKey: "fixture-secret",
      fetch: fetchStub,
    });
    expect(result).toMatchObject({
      connector: "statuscake",
      action: "contactGroups.create",
      data: { data: { new_id: "99" } },
    });
  });
});
