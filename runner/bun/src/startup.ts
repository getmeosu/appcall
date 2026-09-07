import { assertValidRegistry, type ConnectorRegistry } from "./registry";

export function validateRegistryForStartup(registry: ConnectorRegistry): void {
  const issues = registry.validate();
  if (issues.length === 0) {
    console.info(JSON.stringify({
      component: "runner",
      event: "connector_registry_validated",
      issues: 0,
    }));
    return;
  }

  console.error(JSON.stringify({
    component: "runner",
    event: "connector_registry_validation_failed",
    issues,
  }));
  assertValidRegistry(registry);
}
