import { describe, expect, test } from "bun:test";
import { sendMessage, validateCredentials } from "../src/actions";

describe("whatsapp connector actions", () => {
  test("sendMessage validates input and marks connector-owned output", () => {
    expect(sendMessage({ phoneNumberId: "123456789", to: "15551234567", text: "hello" })).toEqual({
      connector: "whatsapp",
      action: "messages.send",
      source: "connector",
      validated: {
        graphVersion: "v25.0",
        phoneNumberId: "123456789",
        to: "15551234567",
        text: "hello",
      },
    });
  });

  test("sendMessage rejects invalid input", () => {
    expect(() => sendMessage({ phoneNumberId: "123456789", to: "", text: "hello" })).toThrow();
  });

  test("validateCredentials accepts required setup fields", () => {
    const result = validateCredentials({ accessToken: "meta-token", phoneNumberId: "123456789" });
    expect(result).toEqual({
      connector: "whatsapp",
      action: "credentials.validate",
      source: "connector",
      valid: true,
      phoneNumberId: "123456789",
    });
    expect(JSON.stringify(result)).not.toContain("meta-token");
  });

  test("validateCredentials rejects missing setup fields", () => {
    expect(() => validateCredentials({ accessToken: "meta-token" })).toThrow();
    expect(() => validateCredentials({ phoneNumberId: "123456789" })).toThrow();
  });
});
