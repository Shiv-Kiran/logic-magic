import { describe, expect, it } from "vitest";
import { buildLoginRedirect, resolveSafeNextPath } from "@/lib/auth/redirect";

describe("auth redirect helpers", () => {
  it("keeps safe internal paths", () => {
    expect(resolveSafeNextPath("/history")).toBe("/history");
    expect(resolveSafeNextPath("/history/run-1")).toBe("/history/run-1");
  });

  it("normalizes invalid next paths to root", () => {
    expect(resolveSafeNextPath("https://example.com")).toBe("/");
    expect(resolveSafeNextPath("//evil.com")).toBe("/");
    expect(resolveSafeNextPath("relative/path")).toBe("/");
  });

  it("builds encoded login redirects", () => {
    expect(buildLoginRedirect("/history")).toBe("/login?next=%2Fhistory");
  });
});
