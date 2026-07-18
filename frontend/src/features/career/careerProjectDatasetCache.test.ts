import { beforeEach, describe, expect, it } from "vitest";
import type { CareerProjectDataset } from "./careerProjectModule";
import {
  clearCareerProjectDatasetCache,
  readCareerProjectDatasetCache,
  writeCareerProjectDatasetCache,
} from "./careerProjectDatasetCache";

function dataset(projectId: string): CareerProjectDataset {
  return {
    sessions: [{
      key: `${projectId}-session`,
      projectId,
      trainingId: projectId,
      completedAt: "2026-07-16T08:00:00.000Z",
      durationMs: 60_000,
      sessionType: "practice",
    }],
    payload: { projectId },
    notice: null,
  };
}

describe("career project dataset cache", () => {
  beforeEach(() => clearCareerProjectDatasetCache());

  it("reuses a user's latest project dataset when Career is mounted again", () => {
    const saved = dataset("grid-shot");
    writeCareerProjectDatasetCache("user-1", "grid-shot", saved);

    expect(readCareerProjectDatasetCache("user-1", "grid-shot")).toBe(saved);
  });

  it("never exposes one user's career data to another user or a guest", () => {
    writeCareerProjectDatasetCache("user-1", "grid-shot", dataset("grid-shot"));

    expect(readCareerProjectDatasetCache("user-2", "grid-shot")).toBeNull();
    expect(readCareerProjectDatasetCache(undefined, "grid-shot")).toBeNull();
  });
});
