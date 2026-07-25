import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const EXECUTOR_NAMES = [
  "executeGoalTransitionActivation",
  "createGoalTransitionActivationCoordinator",
];
const EXECUTOR_MODULE = "GoalTransitionActivationCoordinator";

describe("GoalTransitionActivationCoordinator production boundary", () => {
  it("has exactly one sealed production service import and no other exposure", () => {
    const files = listFiles("src").filter((file) =>
      /\.(js|jsx|mjs|ts|tsx)$/.test(file)
      && !file.endsWith("GoalTransitionActivationCoordinator.js")
      && !file.endsWith(".test.js")
      && !file.endsWith(".test.ts")
      && !file.includes(`${path.sep}fixtures${path.sep}`)
    );
    const violations = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      if (new RegExp(`${EXECUTOR_MODULE}["']`).test(source)
        && (/\b(import|export)\b/.test(source) || source.includes("require("))) {
        violations.push(file);
      }
      if (EXECUTOR_NAMES.some((name) => source.includes(name))) violations.push(file);
    }
    expect([...new Set(violations)]).toEqual([
      path.join("src", "domain", "services", "ProductionGoalTransitionActivationService.js"),
    ]);
  });

  it("has no package or script command that exposes activation execution", () => {
    const files = [
      "package.json",
      ...listFiles("scripts").filter((file) => /\.(js|mjs|cjs|ts)$/.test(file)),
    ];
    const violations = files.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return new RegExp(`${EXECUTOR_MODULE}["']`).test(source)
        || EXECUTOR_NAMES.some((name) => source.includes(name));
    });
    expect(violations).toEqual([]);
  });

  it("contains no implicit production path or runtime-store resolver", () => {
    const source = fs.readFileSync(
      "src/domain/services/GoalTransitionActivationCoordinator.js",
      "utf8"
    );
    expect(source).not.toMatch(/private[\\/]+founder|runtime-store\.json/);
    expect(source).not.toMatch(/getFounderRuntimeStore|resolveFounderRuntimeStorePath|process\.env/);
    expect(source).not.toMatch(/FounderRepositories|persistFounderRuntimeStore/);
  });

  it("keeps the executor out of public index and barrel modules", () => {
    const barrels = listFiles("src").filter((file) =>
      /(^|[\\/])index\.(js|jsx|mjs|ts|tsx)$/.test(file)
    );
    const violations = barrels.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return new RegExp(`${EXECUTOR_MODULE}["']`).test(source)
        || EXECUTOR_NAMES.some((name) => source.includes(name));
    });
    expect(violations).toEqual([]);
  });
});

function listFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}
