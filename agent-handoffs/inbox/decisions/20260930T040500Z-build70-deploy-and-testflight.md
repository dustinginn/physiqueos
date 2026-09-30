Founder/ChatGPT decision — authorize integrated Build 70 Server deploy and TestFlight upload

STANDING REPORTING PROTOCOL

Before stopping for any reason, obey:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

APPROVED CANDIDATES

Server:
claude/build70-integrated-server-20260930
4a81f5b4cac981f9241e40b556341246b83c3309

Native Build 70:
claude/build70-integrated-native-20260930
754376c529964eea280e87419ace68a003a9e0fb

Final integrated report:
agent-handoffs/reports/20260930T032500Z-build70-integrated-persistent-pairing-candidate.md

DECISION

Authorize the staged Build 70 rollout:

1. Deploy exact Server candidate 4a81f5b4 through the established guarded production workflow.
2. Apply migration 000015_sender_constrained_refresh_recovery as required by that exact candidate.
3. KEEP PHYSIQUEOS_SENDER_CONSTRAINED_REFRESH_ENROLLMENT UNSET/OFF.
4. Verify production health, exact source authority, schema 000015, Build 69 legacy refresh compatibility, peptide read/write contracts, Build 70 roll-forward contracts, and preservation of current deployed Photo Intelligence behavior.
5. After successful Server verification, archive/upload exact Native Build 70 candidate 754376c5 to TestFlight using Xcode only.
6. KEEP Native PHYSIQUEOSSenderConstrainedRefreshEnrollment=false for this ordinary Build 70 distribution.
7. Do not silently enroll/re-pair the Founder installation into sender-constrained refresh in this rollout.
8. Publish the deployment + distribution report and stop for Founder acceptance.

PERSISTENT PAIRING

Build 70 includes the persistent-pairing capability but the new protocol remains dormant for Founder use until a separate controlled-canary decision.

Do not:
- enable Server enrollment;
- flip Native enrollment gate;
- force a reconnect;
- perform the controlled enrollment ceremony;
without separate explicit authorization.

The existing iPhone should continue using strict legacy refresh behavior after Server deploy and Build 70 install.

PHOTO INTELLIGENCE

Current production Photo Intelligence at 446bc964 is preserved by the integrated Server candidate.

The separate Codex Photo Intelligence Goal-bias correction/audit is NOT part of this Build 70 rollout.

Do not integrate, deploy, regenerate or alter Photo Intelligence as part of this task.

Preserve all current Photo Intelligence files and historical artifacts exactly.

SERVER DEPLOY SAFETY

Before deploy:
- independently reverify current production authority;
- verify exact candidate ancestry/integration from current production;
- verify migration 000015 has not already been partially applied;
- ensure enrollment flag is unset/off;
- rerun only any minimal exact-SHA predeploy gate required by established workflow; do not repeat already-passed long suites unless authority/code changed.

Deploy exact 4a81f5b4 only.

After deploy verify:
- deployment ACTIVE;
- /live 200;
- /ready 200;
- web/worker exact SHA parity;
- migration 000015 applied;
- schema/readiness correct;
- Server enrollment flag remains off;
- existing Build 69 device/session can still authenticate/refresh through legacy strict rotation;
- peptide/support read returns expected additive fields including localDate/doseAdjustable where applicable;
- Pause/Resume canonical contracts are reachable;
- Logged Today provenance, Foam Rolling skip and Weight weekly-range Server behavior remain intact;
- Photo Intelligence runtime/contracts remain present;
- no unintended Founder-data drift.

Do not destructively roll back migration 000015 if a rollback is needed. Roll back code while retaining the additive migration, per the reviewed plan.

NATIVE DISTRIBUTION

Only after successful Server verification:
- archive exact Native 754376c5;
- verify archive source/build identity;
- upload through Xcode only;
- no App Store Connect or Apple Developer browser login;
- if Xcode requires reauthentication, STOP and tell Founder;
- do not modify source after validation/upload without creating a new candidate;
- confirm Build 70 processing/VALID/available-for-testing status.

Do not run a broad simulator tour before upload.

FOUNDER ACCEPTANCE SCOPE

After Build 70 is available, Founder acceptance should focus on changed workflows:

1. Existing connection survives install with no re-pair and no Face ID prompt.
2. Peptide support editor:
   - simple Dose / Days / Time / Reminder / Notes model;
   - Pause / Cancel Pause / Resume;
   - correct next-dose behavior;
   - dose changes;
   - Advanced planned-dose flow only where needed;
   - custom/manual plan Save behavior.
3. Foam Rolling Priority shows Mark Skipped.
4. Logged Today Apple Health provenance applies naturally to the Training group.
5. Weight Weekly Averages extend through the full selected Goal range.
6. Existing accepted Logger quick navigation remains intact.
7. Existing Workout Complete records/confetti remains intact.
8. Existing Activity/HealthKit daily-driver behavior does not regress.

The known HealthKit Strength reconciliation notification timing issue — notification still waiting until Log opens — is NOT expected to be fixed in Build 70 and remains a follow-up.

REPORTING

Before stopping, publish a GH report containing:
- predeploy production authority;
- exact deployed Server SHA;
- deployment ID/status;
- migration 000015 result;
- enrollment flag status;
- health/source parity;
- legacy Build 69 refresh/auth verification;
- relevant contract checks;
- zero unintended data drift;
- exact Native archive/build identity;
- TestFlight upload/processing status;
- any Xcode auth issue;
- Founder acceptance checklist;
- rollback notes;
- blockers/follow-ups.

If any deployment verification fails, do NOT upload Native. Publish the checkpoint and stop.

END DECISION.
