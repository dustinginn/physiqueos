import { createElement } from "react";
import { buildMonthlyFixtureInspection } from "./fixtureInspector";

const fixtureLink = (href, label, className = "text-blue-600 underline") => createElement("a", { className, href }, label);

export default async function MonthlyBriefingPreviewInspectorPage({ searchParams }) {
  const summary = await buildMonthlyFixtureInspection(searchParams);

  return createElement(
    "main",
    { className: "app-surface min-h-screen overflow-x-hidden p-4" },
    createElement(
      "section",
      { className: "mb-4 rounded border bg-[var(--surface-elevated)] p-3" },
      createElement("h1", { className: "text-xl font-bold" }, "Monthly Preview Editorial Decision Inspector"),
      createElement("p", { className: "mt-2 text-sm font-semibold" }, `Active fixture: ${summary.fixture.name}`),
      createElement("p", { className: "text-sm" }, `Fixture month: ${summary.fixture.monthlyWindow.startDate} through ${summary.fixture.monthlyWindow.endDate}`),
      createElement("p", { className: "mt-2 text-xs font-semibold text-slate-500" }, "Fixture selector: julyContinuation | ordinaryMonth"),
      createElement(
        "p",
        { className: "mt-1 text-sm" },
        fixtureLink("/briefings/monthly/preview/2026-07-01/inspect?fixture=julyContinuation", "July synthetic transition", "mr-3 text-blue-600 underline"),
        fixtureLink("/briefings/monthly/preview/2026-07-01/inspect?fixture=ordinaryMonth", "Ordinary-month control"),
      ),
    ),
    createElement(
      "section",
      { className: "rounded border bg-[var(--surface-elevated)] p-3" },
      createElement("pre", { style: { whiteSpace: "pre-wrap", wordBreak: "break-word" } }, JSON.stringify(summary, null, 2)),
    ),
  );
}
