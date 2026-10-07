import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

describe("Web Priority Skip parity", () => {
  it("renders projected commands on Home tiles and grouped child occurrences", () => {
    const focus = read("./FocusTile.jsx");
    const card = read("../cards/TodaysFocusCard.jsx");
    expect(focus).toContain("skipCommand && skipAction");
    expect(focus).toContain("<PrioritySkipForm action={skipAction} command={skipCommand}");
    expect(card).toContain("item.skipCommand && skipAction");
    expect(card).toContain("command={item.skipCommand}");
  });

  it("renders Mark Skipped as a secondary action on every Detail template with command presence", () => {
    const detail = read("../../screens/PriorityDetailScreen.jsx");
    expect(detail).toContain("priority.skipCommand && skipAction");
    expect(detail).toContain("command={priority.skipCommand}");
    expect(detail.indexOf("priority.action?.label")).toBeLessThan(detail.indexOf("priority.skipCommand && skipAction"));
  });
});
