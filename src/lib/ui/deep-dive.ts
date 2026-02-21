import { JobStatus } from "@/lib/logic/types";

export function shouldShowDeepDiveTab(hasDeepDivePayload: boolean): boolean {
  return hasDeepDivePayload;
}

export function getDeepDiveStatusMessage(args: {
  hasDeepDivePayload: boolean;
  jobStatus?: JobStatus;
}): string | null {
  if (args.hasDeepDivePayload || !args.jobStatus) {
    return null;
  }

  if (args.jobStatus === "FAILED") {
    return "Deep Dive is currently unavailable.";
  }

  return "Deep Dive is preparing...";
}
