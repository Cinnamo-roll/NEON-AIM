import { describe, expect, it } from "vitest";
import { getCareerProject, listCareerProjects } from "./careerProjectRegistry";

describe("career project registry", () => {
  it("registers every project with a unique id", () => {
    const projects = listCareerProjects();
    expect(new Set(projects.map((project) => project.id)).size).toBe(projects.length);
  });

  it("keeps capability contribution weights normalized", () => {
    for (const project of listCareerProjects()) {
      const total = project.capabilities.reduce((sum, capability) => sum + capability.weight, 0);
      expect(total).toBeCloseTo(1, 6);
      expect(project.capabilities.every((capability) => capability.weight > 0)).toBe(true);
    }
  });

  it("exposes Grid Shot through the generic lookup", () => {
    expect(getCareerProject("grid-shot")?.engineId).toBe("clicking");
    expect(getCareerProject("tracking")).toBeUndefined();
  });
});
