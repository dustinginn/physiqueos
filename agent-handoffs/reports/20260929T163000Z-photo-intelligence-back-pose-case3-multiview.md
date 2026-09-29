# Photo Intelligence Back Pose Case 3 — multi-view development result

Status: **ARCHITECTURE / CALIBRATION CASE — HUMAN REFERENCE PRE-FROZEN**  
Decision: `agent-handoffs/inbox/decisions/20260929T162000Z-photo-intelligence-back-pose-case3-multiview.md`  
Baseline: 2026-06-13  
Comparison: 2026-07-18  
Interval: 35 days  
Goal context: Visible Abs

This is not blind validation. The human reference was already frozen in the GH decision before the photos were supplied. The images were nevertheless inspected as a zero-write, photo-only PI replay without using DEXA, weight, training, nutrition, activity, sleep, or other non-photo evidence to alter the observations.

## Exact source identity

| Role | Date | View / pose | Source image ID | Image facts |
|---|---:|---|---|---|
| Baseline | 2026-06-13 | Back / informal double-biceps | `sha256:13ef0080b14f20c7620b0e4665228aa9728a41e30017bdf39a3d2171793bf9b5` | JPEG, 2880 × 3840 |
| Comparison | 2026-07-18 | Back / informal double-biceps | `sha256:04e79be2b1a93e02e7c002bcbe641568685b6d9ef37199374d807c883defe323` | JPEG, 2880 × 3840 |

The private image bytes and local attachment paths are not committed.

## Photo-only PI result

Dominant story: the July back view is visibly leaner and more defined, led by a tighter lower back and waist plus clearer separation through the upper back, rear delts, lats, and arms. Together, those changes produce a substantially stronger back-to-waist taper.

- Reported visual magnitude before generic calibration: `moderate`.
- Canonical calibrated set magnitude: `major`.
- Reliability: `moderate_to_high`.
- Goal direction: `supportive`, with `strong_visual_support`.
- Comparability: `moderate`.

The generic high-end calibration promoted the result because a high-confidence global conditioning anchor is supported by six distinct, reliable, aligned regional findings. The result did not rely on dates, a back-specific exception, or human-reference wording.

### Regional observations

| Region | Direction | Magnitude | Confidence | PI observation |
|---|---|---:|---:|---|
| Overall back conditioning | Improved | Moderate | High | The back appears visibly leaner and sharper, with broader muscular separation and a cleaner transition into the waist. |
| Lower back / waist | Increased apparent leanness | Pronounced | Moderate-to-high | The lower back and waist look substantially tighter, with less apparent flank and lower-back softness above the waistband. |
| Upper back | Increased definition | Moderate | Moderate-to-high | Upper-back musculature and scapular borders are considerably easier to distinguish. |
| Rear delts | Increased definition | Moderate | Moderate | Rear-delt contours separate more clearly from the upper arms and upper back. |
| Upper arms / triceps | Increased definition | Moderate | Moderate | Rear-arm and triceps contours appear sharper. |
| Lats | Increased definition | Moderate | Moderate | Lat borders and the transition from upper back to waist are clearer. |
| Back-to-waist taper | Improved | Pronounced | Moderate-to-high | The taper is substantially stronger, driven mainly by the tighter waist and clearer back definition. |
| Lat size | Unresolved | None | Low | Pose, scapular position, leanness, and framing prevent a reliable lat-growth conclusion. |

### Pose-specific comparability

Useful similarities:

- both images are directly back-facing;
- both use a broadly comparable double-arm flexed pose;
- the setting and shorts match;
- the full back and waist are visible.

Material limitations:

- the June elbows are farther outward and the upper arms are nearer horizontal;
- the July elbows are higher and the forearms more vertical;
- scapular positioning and flexing mechanics differ;
- the June image is closer and more tightly framed;
- daylight and shadow direction differ.

Those limitations reduce confidence in back-width, lat-size, and hypertrophy claims. They do not suppress the widespread conditioning conclusion because the tighter lower back, clearer upper-back separation, rear-delt and arm definition, and improved taper all move together.

## Exact coach-style sample Photo Briefing copy

> Your cut is showing clearly from the back. By July, your waist and lower back look noticeably tighter, and there is much more separation through your upper back, rear shoulders, lats, and triceps. That gives you a substantially stronger taper from shoulders to waist and is a major visual step toward Visible Abs. The higher elbow position changes how wide the back can look, so these photos do not prove lat growth—but the improvement in conditioning and overall shape is clear.

The structured artifact is:

`agent-handoffs/photo-intelligence/founder-cases/case-3-2026-06-13-to-2026-07-18-BACK-MULTIVIEW-DEVELOPMENT.json`

## Human-reference comparison

| Dimension | PI | Frozen human reference | Assessment |
|---|---|---|---|
| Dominant story | Leaner, sharper back; tighter lower back/waist; stronger taper | Clear conditioning/definition change led by lower back/waist and stronger taper | Strong agreement |
| Overall magnitude | Major after generic calibration | Moderate-to-major | PI is at the upper edge, but supported by the breadth of aligned changes |
| Lower back / waist | Pronounced leanness improvement | Major improvement | Agreement |
| Upper back | Moderate definition improvement | Moderate-to-major | Slightly conservative regionally |
| Rear delts | Moderate definition improvement | Moderate | Agreement |
| Arms / triceps | Moderate definition improvement | Moderate | Agreement |
| Lat definition | Moderate improvement | Moderate improvement | Agreement |
| Lat size | Unresolved / low confidence | Possible, not reliably distinguishable | Agreement and appropriate restraint |
| Taper | Pronounced improvement | Major improvement | Agreement |
| Pose limitation | Material for width/size, not enough to erase conditioning | Same | Strong agreement |

No perception or pose-reasoning failure was found. The only calibration difference is that PI resolves the set-level result to `major`, while the human reference spans `moderate-to-major`. That is a small upper-bound magnitude difference, not a narrative or regional-ranking mismatch. It should be watched in prospective monthly sets rather than tuned against this revealed case.

## Additive multi-view architecture

`canonical_photo_intelligence_set_v1` adds a set-level contract while preserving the existing `canonical_photo_intelligence_v1` view producer.

The new layer:

- retains source ID, set ID, date, view, pose, visible regions, comparability, observations, and confidence for every matched view;
- matches exact normalized view-and-pose keys only;
- preserves composite prior-set identity and per-view dates when the views in a current set compare against different historical sets, rather than inventing a single baseline date;
- records unmatched views as `not_compared`, never as “no change”;
- produces one reconciled set assessment with observation-to-view references;
- derives downstream observation comparability from the supporting view or views instead of applying the weakest set-wide rating to every observation;
- exposes genuine, same-conclusion cross-view corroboration separately from immutable per-view confidence and does not inflate global reliability;
- exposes conflicting directional findings, set magnitude, and coach copy as mixed rather than selecting the more favorable view;
- keeps Goal ranking separate from underlying visual observations;
- remains photo-only and compatible with holistic synthesis;
- allows existing front-only Photo Events to become valid one-view sets.

The Photo Event producer now emits the set contract. The shared V3 adapter accepts both the legacy single-view and new set schemas, keeping the change backward compatible.

## Copy and cadence changes

Holistic Photo Briefing realization now uses coach-style language. Internal convergence and attribution remain structured, while user-facing copy avoids phrases such as “independent evidence converges,” “photo-level direction,” and “visual confidence field.”

No universal cadence was added to PI. Monthly Build Lean Mass scheduling remains a Goal/phase/product-policy concern; PI continues to interpret the valid interval it receives.

## Deployment recommendation

The implementation is suitable for code review and deterministic validation. Case 3 does not create a new mandatory held-out release gate, and the prior requirement for a third unseen Founder pair is removed. Future monthly Founder photo sets should serve as prospective production validation.

No deployment, Founder production mutation, or TestFlight upload was performed.
