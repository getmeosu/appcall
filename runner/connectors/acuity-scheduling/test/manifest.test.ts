import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.0");
  expect(manifest.http?.auth.basic.username).toBe("{{userId}}");
  expect(manifest.network?.allowedHosts).toEqual(["acuityscheduling.com"]);
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.sideEffect).toBe("read");
      expect(op.request).toBeUndefined();
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(["read", "write", "destructive"]).toContain(op.sideEffect);
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
  expect(["webhook.appointmentScheduled", "webhook.appointmentRescheduled", "webhook.appointmentCanceled", "webhook.appointmentChanged", "webhook.orderCompleted"].every((key) => manifest.operations[key] === undefined)).toBe(true);
});
