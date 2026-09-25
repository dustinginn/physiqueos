import { createCoachingUpdatesReadService } from "./CoachingUpdatesReadService";
import { resolveBriefingTimeZoneAuthority } from "./BriefingScheduleAuthority";

// Resolves the ONE recurring-briefing (Midweek / Weekly / Monthly) timezone the
// same way for the cadence registry/scheduler AND for every generator, so
// eligibility, the evidence window, settlement, the generator window and the
// persisted watermark can never disagree. Precedence lives in
// `resolveBriefingTimeZoneAuthority` (explicit Coaching Updates timezone ->
// stored user timezone [`timeZone`, legacy `timezone`] -> product default).
//
// Inputs are STORED state only. There is deliberately no parameter for a
// request, device or travel timezone: transient client zones must not be able
// to move a strategic window.
//
// `suppliedTimeZone` is the timezone the cadence executor already resolved for
// this occurrence (`entry.timeZone`). A generator honors it verbatim so the
// window it builds is provably the window the scheduler evaluated; a direct
// or ad-hoc invocation without it resolves through the identical code path.
//
// Returns `{ timeZone, source, coachingUpdates }`; `coachingUpdates` is the
// current Coaching Updates read model (null when none is configured) so a
// caller needs no second read.
export async function resolveRecurringBriefingTimeZone({
  repositories,
  userId,
  user = null,
  suppliedTimeZone = null,
} = {}) {
  const { model, timeZoneSource } = await createCoachingUpdatesReadService({ repositories })
    .getCurrentWithTimeZoneSource({ userId });
  const resolved = resolveBriefingTimeZoneAuthority({
    coachingUpdates: model,
    user,
    coachingTimeZoneSource: timeZoneSource,
  });
  const supplied = typeof suppliedTimeZone === "string" && suppliedTimeZone.trim()
    ? suppliedTimeZone
    : null;
  return Object.freeze({
    timeZone: supplied ?? resolved.timeZone,
    source: supplied && supplied !== resolved.timeZone ? "supplied_by_caller" : resolved.source,
    coachingUpdates: model,
  });
}
