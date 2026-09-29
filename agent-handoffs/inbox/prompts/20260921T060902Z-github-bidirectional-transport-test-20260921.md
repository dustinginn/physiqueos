# Task: github-bidirectional-transport-test-20260921

Task id: `github-bidirectional-transport-test-20260921`
Target agent: claude
Unique marker: `PHYSIQUEOS_BIDIRECTIONAL_TASK_TEST_V1`

## Goal

Harmless end-to-end test of the ChatGPT -> GitHub -> Claude reverse transport. Nothing about the application or
production is to change. The only output is a completion handoff that proves this task was retrieved correctly.

## Do

1. Confirm you retrieved the right task: the inbox `task.id` is exactly `github-bidirectional-transport-test-20260921`,
   its status was `ready`, and `target.agent` permits you (claude).
2. Confirm the unique marker above, `PHYSIQUEOS_BIDIRECTIONAL_TASK_TEST_V1`, appears verbatim in this prompt.
3. Reverify authority read-only, as `instructions.reverify_authority` requires: production Server SHA and active
   deployment, and the Native SHA/build. The `expected_*` values in the inbox file are hints; record what you
   actually observe, and note any difference.
4. Optionally claim the task (`physiqueos-inbox claim --agent claude`).
5. Publish a completion handoff through the existing protocol, using the same task id, and pass
   `--inbox-task-id github-bidirectional-transport-test-20260921` to the publisher. In the handoff state:
   retrieval verified (yes/no), marker verified (yes/no), the authority values you observed, and that nothing
   was changed. Set `success` to true only if both verifications passed.

## Do not

- Do not change any application file, Server or Native code, configuration or infrastructure.
- Do not change production, deploy, build Native, upload to TestFlight, or touch App Store Connect credentials.
- Do not start Build 48.
- Do not edit this prompt or the inbox files by hand; the publisher updates the inbox status.
- Do not include secrets, credentials, raw production data or Founder evidence in the handoff.

## Completion

Reply to the Founder with a short status only: task id, retrieval verified yes/no, marker verified yes/no,
handoff commit SHA.
