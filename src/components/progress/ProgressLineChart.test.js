import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { getChartPointKey } from "./ProgressLineChart";

describe("ProgressLineChart point identity", () => {
  it("uses stable source identity and an index disambiguator", () => {
    expect(getChartPointKey({ id: "weight-1", date: "2026-07-11" }, 0)).toBe("point-weight-1-0");
    expect(getChartPointKey({ date: "2026-07-11" }, 1)).toBe("point-2026-07-11-1");
  });

  it("keeps duplicate dates unique", () => {
    const points = [{ date: "2026-07-11" }, { date: "2026-07-11" }];
    expect(new Set(points.map(getChartPointKey)).size).toBe(2);
  });

  it("changes keys only and preserves chart presentation markup", () => {
    const source = fs.readFileSync(new URL("./ProgressLineChart.jsx", import.meta.url), "utf8");
    expect(source).toContain('viewBox={`0 0 ${width} ${height}`}');
    expect(source).toContain('strokeWidth="3"');
    expect(source).toContain('r="3"');
    expect(source).toContain("key={getChartPointKey(point, index)}");
    expect(source).toContain('key={getChartPointKey(marker, index, "marker")}');
  });
});
