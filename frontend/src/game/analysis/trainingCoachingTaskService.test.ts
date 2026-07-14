import { describe, expect, it } from "vitest";
import { formatCoachingTarget, formatCoachingValue } from "./trainingCoachingTaskService";

describe("training coaching task formatting", () => {
  it("keeps compact units and target direction clear", () => {
    expect(formatCoachingValue(90, "%")).toBe("90%");
    expect(formatCoachingValue(287.4, "ms")).toBe("287.4ms");
    expect(formatCoachingTarget({ operator: "AT_LEAST", value: 90, unit: "%" })).toBe("≥ 90%");
    expect(formatCoachingTarget({ operator: "AT_MOST", value: 300, unit: "ms" })).toBe("≤ 300ms");
  });
});
