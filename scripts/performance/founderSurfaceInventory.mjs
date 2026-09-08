export const FOUNDER_HARD_LIMIT_MS = 3_000;

export const FOUNDER_SURFACE_CASES = Object.freeze([
  surface("home", "Home", "/", "core-navigation"),
  surface("goals", "Goals landing", "/goals", "core-navigation"),
  surface("goals", "Build Lean Mass Goal", "/goals/build-lean-mass", "active-goal"),
  surface("goals", "Visible Abs completed Goal", "/goals/visible-abs", "completed-goal"),
  surface("goals", "Lean Mass supporting Goal", "/goals/lean-mass", "compatibility-runtime"),
  surface("goals", "Maintenance supporting Goal", "/goals/maintenance", "compatibility-runtime"),
  surface("goals", "Goal transition", "/goals/transition", "compatibility-runtime", { optional: true, benchmarkSafe: false }),
  surface("goals", "Goal transition protocols", "/goals/transition/protocols", "compatibility-runtime", { optional: true, benchmarkSafe: false }),
  surface("goals", "Goal transition review", "/goals/transition/review", "compatibility-runtime", { optional: true, benchmarkSafe: false }),
  surface("log", "Log landing", "/log", "core-navigation"),
  surface("log", "Training Logger", "/log/training", "core-navigation"),
  surface("log", "Progress Photo intake", "/evidence/photos", "client-intake"),
  surface("log", "DEXA intake", "/evidence/dexa", "client-intake"),
  surface("evidence", "Evidence Hub", "/progress", "progress-hub"),
  surface("evidence", "Energy Evidence", "/progress/energy", "compatibility-runtime"),
  surface("evidence", "Protocols Evidence", "/progress/protocols", "compatibility-runtime"),
  surface("evidence", "Recovery Evidence", "/progress/recovery", "compatibility-runtime"),
  surface("evidence", "Health Metrics Evidence", "/progress/health-metrics", "compatibility-runtime"),
  ...contexts("training", "Training Evidence", "/progress/training", "training-navigation"),
  ...["resistance", "cardio", "volume", "frequency", "consistency", "history"].flatMap((reportId) =>
    contexts("training", `Training report: ${reportId}`, `/progress/training/reporting/${reportId}`, "training-navigation")
  ),
  ...contexts("training", "Training Library", "/progress/training/library", "training-navigation"),
  ...["cardio", "resistance", "chest", "back", "shoulders", "biceps", "triceps", "forearms", "quadriceps", "hamstrings", "glutes", "calves", "core"].flatMap((category) =>
    contexts("training", `Training Library category: ${category}`, `/progress/training/library/${category}`, "training-navigation")
  ),
  ...contexts("nutrition", "Nutrition Evidence", "/progress/nutrition", "progress-evidence"),
  ...["calories", "macros", "meals", "adherence", "consistency"].flatMap((reportId) =>
    contexts("nutrition", `Nutrition report: ${reportId}`, `/progress/nutrition/reporting/${reportId}`, reportId === "calories" || reportId === "macros" || reportId === "meals" ? "compatibility-runtime" : "compatibility-runtime")
  ),
  ...["calories", "macros", "meals", "micronutrients", "supplements", "hydration"].map((category) =>
    surface("nutrition", `Nutrition Library: ${category}`, `/progress/nutrition/library/${category}`, "compatibility-runtime")
  ),
  ...contexts("activity", "Activity Evidence", "/progress/activity", "progress-evidence"),
  ...contexts("weight", "Weight Evidence", "/progress/weight", "progress-evidence"),
  ...contexts("dexa", "DEXA Evidence", "/progress/dexa", "progress-evidence"),
  ...contexts("photos", "Progress Photos Evidence", "/progress/photos", "progress-photos"),
  surface("briefings", "Briefing History", "/briefings/review", "briefing-navigation"),
  surface("briefings", "Weekly Briefing", "/briefings/weekly", "compatibility-runtime"),
  surface("briefings", "Daily Briefing", "/briefing/daily", "compatibility-runtime"),
  surface("briefings", "Morning Check-in", "/check-in/morning", "core-navigation"),
  surface("profile", "You", "/profile", "core-navigation"),
  surface("profile", "Operating Plan", "/profile/operating-plan", "core-navigation"),
  surface("profile", "Operating Plan tracking", "/profile/operating-plan/tracking", "compatibility-runtime"),
  surface("profile", "Morning weigh-in support editor", "/profile/operating-plan/tracking/morning-weigh-in", "bounded-runtime"),
  surface("profile", "DEXA execution detail", "/profile/operating-plan/execution/dexa", "bounded-runtime"),
  surface("profile", "DEXA execution editor", "/profile/operating-plan/execution/dexa?edit=1", "bounded-runtime"),
  surface("profile", "New activity protocol", "/profile/operating-plan/activity/new", "bounded-runtime"),
  surface("profile", "New energy strategy", "/profile/operating-plan/energy/new", "bounded-runtime"),
  surface("profile", "New training protocol", "/profile/operating-plan/training/new", "bounded-runtime"),
  surface("profile", "New supplement strategy", "/profile/operating-plan/supplements/new", "bounded-runtime"),
  surface("timeline", "History timeline", "/timeline", "compatibility-runtime"),
]);

export const DYNAMIC_ROUTE_PATTERNS = Object.freeze([
  dynamic("home", "Priority detail", /^\/priorities\/[^/?#]+$/, "priority-navigation"),
  dynamic("goals", "Goal editor", /^\/goals\/[^/?#]+\/edit$/, "compatibility-runtime"),
  dynamic("evidence", "Evidence Review", /^\/evidence\/review\/[^/?#]+$/, "evidence-review"),
  dynamic("confidence", "Analysis / Confidence detail", /^\/analysis\/[^/?#]+$/, "compatibility-runtime"),
  dynamic("training", "Training Day", /^\/progress\/training\/day\/[^/?#]+$/, "training-navigation"),
  dynamic("training", "Training Session detail", /^\/progress\/training\/session\/[^/?#]+$/, "training-navigation"),
  dynamic("training", "Training exercise detail", /^\/progress\/training\/library\/[^/?#]+\/[^/?#]+$/, "training-navigation"),
  dynamic("nutrition", "Nutrition Day", /^\/progress\/nutrition\/day\/[^/?#]+$/, "compatibility-runtime"),
  dynamic("dexa", "DEXA Event Briefing", /^\/briefings\/dexa\/[^/?#]+$/, "briefing-navigation"),
  dynamic("photos", "Photo Event Briefing", /^\/briefings\/photo\/[^/?#]+$/, "photo-event-briefing"),
  dynamic("briefings", "Briefing history detail", /^\/briefings\/review\/[^/?#]+$/, "briefing-navigation"),
  dynamic("briefings", "Monthly Briefing", /^\/briefings\/monthly\/[^/?#]+$/, "briefing-navigation"),
  dynamic("profile", "Protocol detail", /^\/profile\/protocols\/[^/?#]+$/, "compatibility-runtime"),
  dynamic("profile", "Protocol editor", /^\/profile\/protocols\/[^/?#]+\/edit$/, "compatibility-runtime"),
  dynamic("profile", "Strategy detail", /^\/profile\/operating-plan\/strategy\/[^/?#]+\/[^/?#]+$/, "compatibility-runtime"),
  dynamic("profile", "Strategy editor", /^\/profile\/operating-plan\/strategy\/[^/?#]+\/[^/?#]+\/edit$/, "compatibility-runtime"),
  dynamic("profile", "Execution detail/editor", /^\/profile\/operating-plan\/execution\/[^/?#]+$/, "compatibility-runtime"),
  dynamic("profile", "Peptide execution", /^\/profile\/operating-plan\/execution\/peptides\/[^/?#]+$/, "compatibility-runtime"),
  dynamic("profile", "Supplement execution", /^\/profile\/operating-plan\/execution\/supplements\/[^/?#]+$/, "compatibility-runtime"),
  dynamic("profile", "Supplement strategy editor", /^\/profile\/operating-plan\/supplements\/[^/?#]+\/edit$/, "compatibility-runtime"),
]);

export const EXCLUDED_NON_NORMAL_SURFACES = Object.freeze([
  Object.freeze({ prefix: "/api/v1/native/sandbox", reason: "Native V1 isolated sandbox; audited for compatibility, not Founder web route timing." }),
  Object.freeze({ prefix: "/api/v1/operations", reason: "Operator control plane, not a normal Founder-facing interaction." }),
  Object.freeze({ prefix: "/preview", reason: "Fixture/visual preview surface." }),
  Object.freeze({ prefix: "/lab", reason: "Development laboratory surface." }),
  Object.freeze({ prefix: "/photo-simulator", reason: "Development simulator." }),
  Object.freeze({ prefix: "/briefings/dexa/preview", reason: "Preview-only briefing surface." }),
  Object.freeze({ prefix: "/briefings/monthly/preview", reason: "Preview/inspector surface." }),
  Object.freeze({ prefix: "/briefings/weekly/preview", reason: "Preview-only briefing surface." }),
]);

export const REPRESENTATIVE_INGRESS_CASES = Object.freeze([
  "/",
  "/goals",
  "/goals/build-lean-mass",
  "/goals/visible-abs",
  "/progress",
  "/progress/training?context=all",
  "/progress/training?context=build-lean-mass",
  "/progress/nutrition/reporting/calories?context=all",
  "/progress/photos?context=all",
  "/briefings/review",
  "/profile/operating-plan",
]);

function contexts(group, label, pathname, architecture) {
  return [
    surface(group, `${label} — active Goal`, withContext(pathname, "build-lean-mass"), architecture),
    surface(group, `${label} — completed Goal`, withContext(pathname, "visible-abs"), architecture),
    surface(group, `${label} — all history`, withContext(pathname, "all"), architecture),
  ];
}

function withContext(pathname, context) {
  return `${pathname}${pathname.includes("?") ? "&" : "?"}context=${context}`;
}

function surface(group, label, path, architecture, extra = {}) {
  return Object.freeze({ group, label, path, architecture, ...extra });
}

function dynamic(group, label, pattern, architecture) {
  return Object.freeze({ group, label, pattern, architecture });
}
