import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MorningCheckInScreen from "./MorningCheckInScreen";

const source = fs.readFileSync(
  new URL("./MorningCheckInScreen.jsx", import.meta.url),
  "utf8"
);

describe("focused Morning Check-In", () => {
  it("keeps the 393px fast numeric workflow", () => {
    expect(source).toContain("max-w-[393px]");
    expect(source).toContain('inputMode="decimal"');
    expect(source).toContain('step="0.1"');
    expect(source).toContain("Save Weight");
    expect(source).toContain("pb-32");
    expect(source).toContain("overflow-x-hidden");
  });

  it("blocks repeat submission and excludes universal intake controls", () => {
    expect(source).toContain("useFormStatus");
    expect(source).toContain("disabled={pending}");
    expect(source).not.toMatch(
      /file upload|evidence type|evidenceNote|Quick Actions|supplements|Quick Notes/i
    );
  });

  it("explains same-day correction behavior", () => {
    expect(source).toMatch(
      /already exists for today.*correct today’s entry.*same value will make no change/s
    );
  });

  it("Case V renders two occurrence-keyed priorities with independent required controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(MorningCheckInScreen, {
        dateLabel: "Wednesday, July 29, 2026",
        reconciliationItems: [
          {
            id: "tesamorelin",
            occurrenceDate: "2026-07-28",
            occurrenceKey: "tesamorelin:2026-07-28",
            title: "Tesamorelin",
            dateLabel: "Yesterday",
          },
          {
            id: "foam-roll",
            occurrenceDate: "2026-07-28",
            occurrenceKey: "foam-roll:2026-07-28",
            title: "Foam Roll",
            dateLabel: "Yesterday",
          },
        ],
      })
    );

    expect(html).toContain("Yesterday’s unfinished priorities");
    expect(html).toContain("Tesamorelin");
    expect(html).toContain("Foam Roll");
    expect(html).toContain('name="tesamorelin:2026-07-28_status"');
    expect(html).toContain('name="foam-roll:2026-07-28_status"');
    expect(html.match(/required=""/g)).toHaveLength(7);
  });

  it("Case W omits the unfinished-priorities section when the model is empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(MorningCheckInScreen, {
        dateLabel: "Wednesday, July 29, 2026",
        reconciliationItems: [],
      })
    );

    expect(html).not.toContain("unfinished priorities");
    expect(html).toContain("Morning weight");
    expect(html).toContain("Recovery evidence");
  });

  it("keeps reconciliation controls touch-friendly and overflow-safe at the 393px shell", () => {
    expect(source).toContain("min-h-12");
    expect(source).toContain("min-w-0");
    expect(source).toContain("break-words");
    expect(source).toContain("has-[:checked]");
    expect(source).toContain("Choose one outcome for each priority.");
  });
});
