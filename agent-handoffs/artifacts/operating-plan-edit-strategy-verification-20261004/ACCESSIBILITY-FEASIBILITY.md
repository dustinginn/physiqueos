# Accessibility feasibility

- Every choice, stepper control, Cancel action and Save action has a 44 pt or larger target.
- Selected states use text, filled treatment and a radio-style mark rather than color alone.
- Units remain adjacent to editable values (`g per lb bodyweight`, `x / week`).
- Field order matches the source order used by VoiceOver.
- At accessibility Dynamic Type sizes, choice groups wrap and frequency rows can stack label above stepper without changing semantics.
- Save errors use `role=alert` in the harness and should remain an accessibility announcement in Native.
- Dark and mineral appearances retain strong text and selected-control contrast.
- The forms use stepper/picker-style controls, avoiding keyboard-only numeric entry in the current Native flow.
