import { describe, expect, it, vi } from "vitest";
import {
  createEvidenceSuccessNavigation,
  EVIDENCE_SUCCESS_DESTINATION,
} from "./EvidenceSuccessNavigationService";

describe("EvidenceSuccessNavigationService", () => {
  it("navigates exactly once to the existing saved Log destination", () => {
    const navigate = vi.fn();
    const continueFromEvidenceSuccess = createEvidenceSuccessNavigation(navigate);

    expect(continueFromEvidenceSuccess()).toBe(true);
    expect(continueFromEvidenceSuccess()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(EVIDENCE_SUCCESS_DESTINATION);
  });
});
