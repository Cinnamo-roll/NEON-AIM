import { afterEach, describe, expect, it, vi } from "vitest";
import {
  careerPrimaryViewStorageKey,
  readCareerPrimaryView,
} from "../features/career/careerPrimaryViewStorage";

describe("Career primary view memory", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens a user's first Career visit on overview and restores only that user's last primary page", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    expect(readCareerPrimaryView("user-a")).toBe("overview");
    values.set(careerPrimaryViewStorageKey("user-a"), "projects");

    expect(readCareerPrimaryView("user-a")).toBe("projects");
    expect(readCareerPrimaryView("user-b")).toBe("overview");
  });
});
