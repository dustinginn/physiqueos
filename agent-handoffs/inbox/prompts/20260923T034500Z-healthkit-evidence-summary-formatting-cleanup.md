Task id: healthkit-evidence-summary-formatting-cleanup-20260923

Finish the residual Native formatting defect observed on Build 53. Code/test/review only. Do not deploy Server code, mutate production policy, or activate Workout canary.

Reverify current authority. Expected hints: production Server ccff693b61c98737b670be620f7916c375cb37ce, deployment 0bdc1748-d918-452f-a84a-52a9bfdc5373, Native Build 53 SHA 1c57556f.

Founder real-device acceptance already confirms:
Build 53 Activity/Nutrition automatic steady-state sync works.
Log pull-to-refresh works.
Activity/Nutrition metric cards now format numbers correctly.
Residual defect: Evidence summary/headline/subheadline strings still interpolate raw floating-point precision.

Examples observed:
Nutrition headline: 2405.5120239257812 calories; 178.25211668014526g protein; 173.8842658996582g carbs; 109.46525192260742g fat.
Activity headline: 782.1669999999962 active cal; 241.16699999999616 non-workout active cal.
Cards on those same screens correctly show compact values such as 2406, 178g, 174g, 109g, 782 cal, 241 cal.

Fix all remaining raw-double leakage on HealthKit-backed Activity and Nutrition Evidence summary/headline/subheadline/Activity Areas surfaces.

Requirements:
Use the same established formatter as the cards.
Calories display as whole-number calories using established rounding convention.
Macros use the existing compact macro convention.
Headline and cards agree.
Presentation only; do not mutate canonical precision.
Audit Activity and Nutrition Evidence surfaces for other raw-double interpolation.
Regression tests must include the exact ugly values above.
Do not broaden into unrelated non-HealthKit raw-double backlog sites.

Run focused tests, full Native unit suite, relevant UI acceptance, compile checks, mutation-test the formatting regression, and fresh-context independent review.

Prepare the code as the next Native candidate only if needed, but do not archive/upload as part of this task. The upcoming Workout canary may reveal a strictly necessary Native correction; avoid wasting a build number until that readiness work is complete.

Publish completion handoff.

Flags:
ACTIVITY_SUMMARY_FLOAT_TAILS_ELIMINATED
NUTRITION_SUMMARY_FLOAT_TAILS_ELIMINATED
ACTIVITY_NUTRITION_CARDS_UNCHANGED
CANONICAL_PRECISION_UNCHANGED
FULL_NATIVE_SUITE_PASSED
UI_ACCEPTANCE_SUITE_PASSED
INDEPENDENT_REVIEW_APPROVED
NEXT_NATIVE_CANDIDATE_READY
