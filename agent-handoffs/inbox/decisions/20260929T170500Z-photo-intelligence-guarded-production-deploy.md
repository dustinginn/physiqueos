Founder/ChatGPT decision — approve guarded Photo Intelligence Server deployment

Reviewed candidate:
branch codex/photo-intelligence-canonical-holistic-20260929
SHA dd05ef2ba619bf4f11e0f77c1e33bda4d1215b45

Reviewed reports:
- agent-handoffs/reports/20260929T160400Z-photo-intelligence-canonical-holistic-implementation-review.md
- agent-handoffs/reports/20260929T163000Z-photo-intelligence-back-pose-case3-multiview.md
- agent-handoffs/reports/20260929T165500Z-photo-intelligence-case3-multiview-fresh-context-review.md
- agent-handoffs/reports/20260929T153700Z-photo-intelligence-case2-holistic-replay.md

DECISION

APPROVE the Photo Intelligence architecture and implementation for guarded Server deployment, subject to exact-SHA production-authority and deployment-gate verification below.

Accepted product behavior:
- canonical Photo Intelligence remains photo-only and independently auditable;
- holistic Photo Briefing synthesis may use eligible canonical evidence available by the briefing cutoff;
- evidence is time-causal using observation time plus canonical availability/update time;
- historical Photo Briefings remain immutable unless explicit regeneration is separately authorized;
- Case 1 magnitude calibration may reach major while Case 2 remains subtle;
- routine photo-taking coaching is removed from ordinary user-facing realization;
- user-facing Photo Briefing prose should remain coach-oriented rather than exposing engine jargon;
- canonical_photo_intelligence_set_v1 is accepted for additive multi-view photo sets;
- like-for-like views/poses compare where possible;
- unmatched views are not treated as no change;
- per-view provenance/comparability/confidence remain inspectable;
- one reconciled set-level assessment is produced;
- cross-view corroboration is conclusion-scoped;
- conflicting views remain mixed/uncertain rather than cherry-picked;
- front-only historical Photo Events remain supported;
- no third held-out Founder pair is required as a deployment blocker;
- future monthly multi-pose Founder sets serve as prospective production validation.

BEFORE DEPLOYMENT

1. Independently reverify current production Server/Web authority and deployment health.
2. Verify exact candidate dd05ef2ba619bf4f11e0f77c1e33bda4d1215b45 is based on/compatible with current production authority. Do not assume authority from stale reports.
3. Identify schema/migration/infrastructure/dependency changes, if any.
4. If the candidate unexpectedly requires a new destructive or operationally significant migration not already reviewed in the Photo Intelligence reports, STOP and request review.
5. Re-run the established relevant deterministic gates on the exact deployment SHA.
6. Re-run focused Photo Intelligence tests sufficient to establish:
   - photo-only contamination rejection;
   - Case 1/2 frozen artifact integrity;
   - magnitude calibration;
   - multi-view matching/reconciliation;
   - conflicting/missing-view semantics;
   - holistic evidence attribution;
   - observation-time + availability-time cutoff;
   - historical immutability;
   - legacy/front-only compatibility.
7. Production build must pass.

DEPLOYMENT

Deploy only the exact reviewed Photo Intelligence candidate, or a clearly documented merge/cherry-pick descendant required solely to integrate it onto current production authority.

If integration onto current production authority is required:
- keep the diff limited to the reviewed Photo Intelligence work;
- publish the exact integration SHA;
- rerun the relevant gates and fresh-context review on that exact SHA before deploy;
- do not silently incorporate unrelated branch work.

Use the established guarded production workflow.

Do not deploy:
- persistent-pairing/auth candidate;
- Claude/Fable peptide work;
- unrelated Native changes;
- HealthKit Sleep;
- HealthKit delivery-device identity changes.

POST-DEPLOY VERIFICATION

Verify:
- /live and /ready;
- runtime/source commit authority;
- worker/web parity where applicable;
- canonical Photo Intelligence service can produce/consume the accepted contracts;
- canonical_photo_intelligence_set_v1 is backward compatible with existing single-view/front-only Photo Events;
- holistic synthesis uses only cutoff-eligible evidence;
- unknown evidence availability fails closed;
- PI structured visual result is not modified by DEXA/weight/etc.;
- historical stored Photo Briefings are not recomputed or mutated;
- no Founder production data drift or historical artifact mutation occurred as a consequence of deployment;
- no private photo bytes/paths entered GH or logs.

Do NOT regenerate historical Case 1, Case 2, Case 3, Sep 19 Photo Briefing, or any other historical Founder briefing in production.

The existing private/read-only replays remain validation artifacts only.

PROSPECTIVE BEHAVIOR

After deployment, Photo Intelligence applies prospectively through the normal Photo Event / Briefing lifecycle.

Future monthly multi-pose Build Lean Mass progress-photo sets will be the prospective Founder acceptance of the multi-view production behavior.

Do not hard-code a monthly cadence in PI. Cadence remains Goal/phase/product scheduling policy.

NATIVE / TESTFLIGHT

No Native build or TestFlight upload is authorized or required by this decision unless deployment verification discovers a genuine Native contract incompatibility.

If such an incompatibility exists, STOP and report it rather than expanding scope.

REPORTING

Publish a GH deployment/acceptance report containing:
- pre-deploy production authority;
- exact deployed SHA;
- deployment ID;
- schema/migration status;
- exact tests/build/review results;
- /live and /ready results;
- post-deploy authority;
- contract verification;
- historical immutability/data-drift verification;
- any residual risks or follow-ups.

Push-notify Founder when deployment completes successfully or whenever you stop/need input.

END DECISION.
