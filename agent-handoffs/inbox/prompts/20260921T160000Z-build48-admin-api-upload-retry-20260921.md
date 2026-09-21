Task id: build48-admin-api-upload-retry-20260921

Goal

Finish the already-built Native Build 48 release by securely installing the Founder's newly downloaded replacement Admin-role App Store Connect API key on the Mac, updating the existing local PhysiqueOS release configuration to use that key, validating cloud-signing access, and retrying the API-key-authenticated upload of the EXISTING verified Build 48 archive.

Do not rebuild, rebump, regenerate, rearchive, or change Build 48 code.

Known Build 48 authority

Final Native SHA:
bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a

Archive:
~/Library/Developer/Xcode/Archives/2026-09-21/PhysiqueOS Build 48.xcarchive

Expected archive identity:
bundle com.physiqueos.native.dev
team 33GMTRM6G9
version 1.0
build 48

Prior gates passed and independent review approved. Reverify the existing archive identity sufficiently to ensure it is the same verified Build 48 artifact. Do not rerun expensive build/test gates merely for upload.

New Admin API key

The Founder has just downloaded a replacement Admin-role App Store Connect API private-key file to the Mac's normal Downloads location.

Discover the newly downloaded App Store Connect AuthKey .p8 file locally by filename/recency and existing release configuration context. Do not print, cat, inspect, encode, hash, or expose its contents. If more than one plausible newly downloaded key exists and identity is ambiguous, stop rather than guessing.

Derive the key identifier from the downloaded AuthKey filename using Apple's standard naming convention, and obtain the issuer identifier from the existing local release configuration or other established local non-secret App Store Connect configuration if it is unchanged. Do not publish either identifier in the GitHub handoff.

Security requirements

Never print/read/publish .p8 contents.
Never place the private key in the PhysiqueOS repository, GitHub, chat, logs, shell history, .env, scratch payloads, or handoff files.
Do not expose JWTs/tokens.
Keep machine-specific release configuration outside the repository.
Use restrictive owner-only filesystem permissions.
Do not delete/revoke the old Developer key automatically; report it as optional cleanup after the new path is proven.

Install the key

Use the established local App Store Connect key location expected by Apple/Xcode and the existing PhysiqueOS release helper under the Founder's home directory.

Use the installed tooling's documented naming/location requirements. Move or securely copy the newly downloaded key there with owner-only permissions, then remove the Downloads copy only after verifying the secure installed copy exists and is readable by the current user. Do not reveal contents during verification.

Update the existing local PhysiqueOS release configuration outside the repository so the guarded upload helper uses the replacement Admin key. Preserve unrelated settings. Do not echo the full config if it contains sensitive values.

Validate

Run the guarded helper's read-only auth-check using the replacement Admin key.

Then run its Build 48 dry-run/validation path against the EXISTING archive and require all archive identity guards to pass.

Confirm at a sanitized level that the upload path will use App Store Connect API-key authentication and not the interactive Xcode account.

Upload

If authentication and dry-run pass, the Founder explicitly authorizes the real API-key upload of the existing Build 48 archive.

Use the guarded helper and its exact confirmation mechanism for bundle com.physiqueos.native.dev, version 1.0, build 48.

Do not fall back to interactive Xcode authentication.
Do not rebuild/rearchive if upload fails.

If the Admin key still cannot access cloud-managed distribution signing, stop and report the exact Apple-side error and minimum remaining action.

If upload succeeds:
capture the App Store Connect delivery/upload id;
confirm Apple recorded iOS version 1.0 build 48;
capture processing state;
retain the Build 48 archive;
clean only regenerable upload/export scratch;
leave production Server and Founder data untouched;
do not begin HealthKit.

Remote Control / permissions

You are in a Remote Control-managed isolated worktree. Do not create/switch/delete worktrees. This task should not require repository edits.

The Founder explicitly authorizes accessing/moving the newly downloaded replacement Admin .p8 without exposing contents, modifying the local release config to select it, running the guarded App Store Connect upload helper's auth-check/dry-run/execute path, and uploading Build 48 through API-key authentication.

If Claude's local classifier requires direct chat authorization despite this GitHub task, publish a blocked handoff rather than improvising.

Completion handoff

Claim this task and publish a sanitized completion under the same task id:
build48-admin-api-upload-retry-20260921

Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Report:
Build 48 archive identity reverified;
replacement Admin key installed securely yes/no without identifiers/private path/content;
local release config updated yes/no;
Admin API auth-check result;
dry-run result;
cloud-signing result;
upload result;
delivery/upload id and Apple processing state if successful;
old Developer key left untouched;
no rebuild/rearchive;
no production data mutation;
exact next Founder step.

Explicit flags:
BUILD48_EXISTING_ARCHIVE_REUSED
ADMIN_API_KEY_INSTALLED
ADMIN_API_AUTHENTICATION_PASSED
CLOUD_SIGNING_ACCESS_PASSED
BUILD48_UPLOADED_VIA_API_KEY
BUILD48_APPLE_PROCESSING
INTERACTIVE_XCODE_AUTH_NOT_USED
BUILD48_REBUILT_OR_REARCHIVED
PRODUCTION_DATA_MUTATED
FOUNDER_ACTION_REQUIRED
READY_FOR_FOUNDER_BUILD48_ACCEPTANCE

Stop after upload verification. Do not begin HealthKit or the 3 AM briefing Server task.
