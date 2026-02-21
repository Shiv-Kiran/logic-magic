import { describe, expect, it } from "vitest";
import { getDeepDiveStatusMessage, shouldShowDeepDiveTab } from "@/lib/ui/deep-dive";

describe("deep dive ui helpers", () => {
  it("shows deep dive tab only when payload is available", () => {
    expect(shouldShowDeepDiveTab(true)).toBe(true);
    expect(shouldShowDeepDiveTab(false)).toBe(false);
  });

  it("returns preparing message while job is pending", () => {
    expect(
      getDeepDiveStatusMessage({
        hasDeepDivePayload: false,
        jobStatus: "QUEUED",
      }),
    ).toBe("Deep Dive is preparing...");
  });

  it("returns unavailable message when deep dive fails", () => {
    expect(
      getDeepDiveStatusMessage({
        hasDeepDivePayload: false,
        jobStatus: "FAILED",
      }),
    ).toBe("Deep Dive is currently unavailable.");
  });

  it("returns null when deep dive payload exists", () => {
    expect(
      getDeepDiveStatusMessage({
        hasDeepDivePayload: true,
        jobStatus: "COMPLETED",
      }),
    ).toBeNull();
  });
});
