import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_ICON_PRESENTATION,
  getEvidenceIconAppearanceClassName,
  getEvidenceIconPresentation,
} from "./EvidenceIconPresentation";

const indexSource = fs.readFileSync(new URL("./EvidenceHubIndex.jsx", import.meta.url), "utf8");
const badgeSource = fs.readFileSync(new URL("../ui/IconBadge.jsx", import.meta.url), "utf8");
const energySource = fs.readFileSync(
  new URL("../../screens/EnergyEvidenceScreen.jsx", import.meta.url),
  "utf8"
);
const usageSource = fs.readFileSync(
  new URL("../../domain/services/EvidenceHubUsageService.js", import.meta.url),
  "utf8"
);

const EXPECTED_PRESENTATION = {
  training: ["purple", "Dumbbell"],
  nutrition: ["orange", "Salad"],
  weight: ["blue", "Scale"],
  photos: ["rose", "Camera"],
  dexa: ["emerald", "ScanLine"],
  activity: ["amber", "Activity"],
  energy: ["violet", "Zap"],
  recovery: ["teal", "Activity"],
  "health-metrics": ["cyan", "HeartPulse"],
};

describe("Evidence Hub semantic icon presentation", () => {
  it.each(Object.entries(EXPECTED_PRESENTATION))(
    "resolves %s to its semantic foreground, tint, and unchanged glyph",
    (evidenceId, [color, iconName]) => {
      const presentation = getEvidenceIconPresentation(evidenceId);

      expect(presentation.icon.displayName ?? presentation.icon.name).toBe(iconName);
      expect(presentation.foregroundClassName).toContain(`text-${color}-`);
      expect(presentation.backgroundClassName).toContain(`bg-${color}-`);
      expect(getEvidenceIconAppearanceClassName(evidenceId)).toBe(
        `${presentation.backgroundClassName} ${presentation.foregroundClassName}`
      );
    }
  );

  it("defines accessible light and dark foregrounds with subtle translucent tints", () => {
    for (const presentation of Object.values(EVIDENCE_ICON_PRESENTATION)) {
      expect(presentation.foregroundClassName).toMatch(
        /text-\w+-(?:700|800) dark:text-\w+-300/
      );
      expect(presentation.backgroundClassName).toMatch(
        /bg-\w+-100\/70 dark:bg-\w+-400\/15/
      );
    }
  });

  it("keeps the card geometry and interactions unchanged", () => {
    expect(indexSource).toContain(
      'className="flex min-h-[68px] w-full items-center gap-3 rounded-[14px]'
    );
    expect(indexSource).toContain(
      'className="h-8 min-h-8 w-8 min-w-8 flex-none aspect-square rounded-full"'
    );
    expect(indexSource).toContain('size="sm"');
    expect(indexSource).toContain("stream.href");
    expect(indexSource).toContain("onClick={() => onVisit(stream.id)}");
    expect(badgeSource).toContain("const colorClass = appearanceClassName || colors[color]");
  });

  it("keeps canonical Evidence ordering and Energy page semantics separate", () => {
    const expectedOrder = [
      "training",
      "nutrition",
      "weight",
      "photos",
      "dexa",
      "activity",
      "energy",
      "recovery",
      "health-metrics",
    ];
    let cursor = -1;

    for (const evidenceId of expectedOrder) {
      const next = usageSource.indexOf(`"${evidenceId}"`, cursor + 1);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(energySource).toContain("getEnergyMetricValueClass");
    expect(energySource).not.toContain("EvidenceIconPresentation");
  });
});
