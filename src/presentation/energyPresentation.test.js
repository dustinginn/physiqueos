import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENERGY_METRIC_VALUE_CLASSES,
  getEnergyMetricValueClass,
} from "./energyPresentation";

const css = fs.readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8"
);

describe("energyPresentation", () => {
  it("owns one semantic style for each Energy metric", () => {
    expect(ENERGY_METRIC_VALUE_CLASSES.intake).toContain("--energy-intake");
    expect(ENERGY_METRIC_VALUE_CLASSES.expenditure).toContain(
      "--energy-expenditure"
    );
    expect(ENERGY_METRIC_VALUE_CLASSES.balance).toContain("--energy-balance");
  });

  it("uses the same balance green for positive, negative, and zero values", () => {
    expect(getEnergyMetricValueClass("balance", -676)).toBe(
      ENERGY_METRIC_VALUE_CLASSES.balance
    );
    expect(getEnergyMetricValueClass("balance", 120)).toBe(
      ENERGY_METRIC_VALUE_CLASSES.balance
    );
    expect(getEnergyMetricValueClass("balance", 0)).toBe(
      ENERGY_METRIC_VALUE_CLASSES.balance
    );
  });

  it("keeps unavailable values neutral", () => {
    expect(getEnergyMetricValueClass("balance", null)).toBe(
      ENERGY_METRIC_VALUE_CLASSES.neutral
    );
    expect(getEnergyMetricValueClass("intake", undefined)).toBe(
      ENERGY_METRIC_VALUE_CLASSES.neutral
    );
  });

  it("defines contrast-safe light-mode Energy text tokens", () => {
    const colors = {
      intake: token("--energy-intake"),
      expenditure: token("--energy-expenditure"),
      balance: token("--energy-balance"),
    };
    Object.values(colors).forEach((color) => {
      expect(contrastRatio(color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("defines contrast-safe dark-mode Energy text tokens", () => {
    for (const name of [
      "--energy-intake",
      "--energy-expenditure",
      "--energy-balance",
    ]) {
      const values = [
        ...css.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "gi")),
      ].map((match) => match[1]);
      expect(values).toHaveLength(2);
      expect(contrastRatio(values[1], "#141f31")).toBeGreaterThanOrEqual(4.5);
    }
  });
});

function token(name) {
  return css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
}

function contrastRatio(left, right) {
  const values = [left, right].map(luminance).sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : Math.pow((value + 0.055) / 1.055, 2.4)
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
