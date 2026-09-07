import { describe, expect, it } from "bun:test";
import { normalizeUser, parseUsersResponse } from "../src/users";
import usersList from "../fixtures/users_list.json";

describe("normalizeUser", () => {
  const raw1 = usersList.values[0] as any;
  const raw2 = usersList.values[1] as any;

  it("maps all user fields", () => {
    const u = normalizeUser(raw1);
    expect(u.id).toBe("jira-user:uuid-user-1");
    expect(u.provider).toBe("jira");
    expect(u.providerUserId).toBe("uuid-user-1");
    expect(u.displayName).toBe("Jane Smith");
    expect(u.emailAddress).toBe("jane@example.com");
    expect(u.accountId).toBe("uuid-user-1");
    expect(u.active).toBe(true);
    expect(u.timeZone).toBe("America/New_York");
    expect(u.locale).toBe("en_US");
    expect(u.avatarUrl).toBe("https://avatar.example.com/jane.jpg");
  });

  it("maps second user", () => {
    const u = normalizeUser(raw2);
    expect(u.id).toBe("jira-user:uuid-user-2");
    expect(u.displayName).toBe("Bob Jones");
    expect(u.timeZone).toBe("Europe/London");
  });
});

describe("parseUsersResponse", () => {
  it("parses users with no next page", () => {
    const result = parseUsersResponse(usersList);
    expect(result.users).toHaveLength(2);
    expect(result.nextStart).toBeNull();
  });

  it("handles null input", () => {
    const result = parseUsersResponse(null);
    expect(result.users).toHaveLength(0);
  });
});
