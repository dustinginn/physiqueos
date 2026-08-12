import { ApplicationProblem } from "../../contracts/v1/problem.js";
import {
  DEFAULT_LOCAL_TIME_ZONE,
  getLocalDateKey,
  getLocalDayWindow,
  resolveLocalTimeZone,
} from "../../domain/utils/localDate.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";

export function createApplicationDateContext({
  principal,
  userTimeZone,
  clientTimeZone = null,
  now = new Date(),
  localDate = null,
} = {}) {
  requireAuthenticationPrincipal(principal);
  const timeZone = resolveLocalTimeZone(userTimeZone ?? clientTimeZone ?? DEFAULT_LOCAL_TIME_ZONE);
  if (clientTimeZone && resolveLocalTimeZone(clientTimeZone) !== clientTimeZone) {
    throw new ApplicationProblem({
      status: 400,
      code: "INVALID_TIME_ZONE",
      title: "The client time zone is invalid.",
    });
  }
  const dateKey = localDate ?? getLocalDateKey(now, timeZone);
  const window = getLocalDayWindow({ dateKey, timeZone });
  return Object.freeze({
    contractVersion: "1",
    timeZone,
    localDate: dateKey,
    dayStartInclusive: window.startInclusive,
    dayEndExclusive: window.endExclusive,
    serverNow: new Date(now).toISOString(),
  });
}
