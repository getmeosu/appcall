import { describe, expect, it } from "bun:test";
import { normalizeProject, parseProjectsResponse } from "../src/projects";
import projectsList from "../fixtures/projects_list.json";

describe("normalizeProject", () => {
  const raw1 = projectsList.values[0] as any;
  const raw2 = projectsList.values[1] as any;

  it("maps all project fields", () => {
    const p = normalizeProject(raw1);
    expect(p.id).toBe("jira-project:10000");
    expect(p.provider).toBe("jira");
    expect(p.providerProjectId).toBe("10000");
    expect(p.key).toBe("PROJ");
    expect(p.name).toBe("Main Project");
    expect(p.description).toBe("Primary development project");
    expect(p.projectTypeKey).toBe("software");
    expect(p.style).toBe("classic");
    expect(p.leadId).toBe("uuid-lead-1");
    expect(p.leadName).toBe("Jane Smith");
    expect(p.isPrivate).toBe(true);
  });

  it("maps next-gen project", () => {
    const p = normalizeProject(raw2);
    expect(p.id).toBe("jira-project:10001");
    expect(p.key).toBe("OPS");
    expect(p.name).toBe("Operations");
    expect(p.style).toBe("next-gen");
    expect(p.isPrivate).toBe(false);
  });
});

describe("parseProjectsResponse", () => {
  it("parses projects with no next page", () => {
    const result = parseProjectsResponse(projectsList);
    expect(result.projects).toHaveLength(2);
    expect(result.nextStart).toBeNull();
  });

  it("handles null input", () => {
    const result = parseProjectsResponse(null);
    expect(result.projects).toHaveLength(0);
  });
});
