import { describe, expect, it } from "vitest";
import { getPasswordChangeIssue } from "./profileValidation";

describe("password change validation", () => {
  it("requires all three password fields", () => {
    expect(getPasswordChangeIssue("", "", "")).toBe("missing");
    expect(getPasswordChangeIssue("Current123", "Next1234", "")).toBe("missing");
  });

  it("checks confirmation and the backend password policy", () => {
    expect(getPasswordChangeIssue("Current123", "Next1234", "Next5678")).toBe("mismatch");
    expect(getPasswordChangeIssue("Current123", "Next12", "Next12")).toBe("length");
    expect(getPasswordChangeIssue("Current123", "abcdefgh", "abcdefgh")).toBe("weak");
    expect(getPasswordChangeIssue("Current123", "12345678", "12345678")).toBe("weak");
  });

  it("rejects an unchanged password and accepts a valid replacement", () => {
    expect(getPasswordChangeIssue("Current123", "Current123", "Current123")).toBe("unchanged");
    expect(getPasswordChangeIssue("Current123", "NextPass456", "NextPass456")).toBeNull();
  });
});
