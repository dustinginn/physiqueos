export const EVIDENCE_SUCCESS_DESTINATION = "/log?saved=1";

export function createEvidenceSuccessNavigation(navigate) {
  let navigationStarted = false;

  return function continueFromEvidenceSuccess() {
    if (navigationStarted) return false;
    navigationStarted = true;
    navigate(EVIDENCE_SUCCESS_DESTINATION);
    return true;
  };
}
