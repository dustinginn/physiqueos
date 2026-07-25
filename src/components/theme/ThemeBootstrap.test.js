import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  THEME_BOOTSTRAP_CODE,
  THEME_STORAGE_KEY,
  applyThemePreference,
  readThemePreference,
  resolveThemePreference,
} from "./themeContract";

function createRoot() {
  const classes = new Set(["font-variable"]);
  return {
    classes,
    root: {
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
      dataset: {},
    },
  };
}

function executeBootstrap({ stored = "system", systemDark = false, storageError = false, matchMedia } = {}) {
  const { root, classes } = createRoot();
  const localStorage = storageError
    ? { getItem() { throw new Error("storage blocked"); } }
    : { getItem: vi.fn(() => stored) };
  const window = { localStorage };
  if (matchMedia !== null) {
    window.matchMedia = matchMedia ?? vi.fn(() => ({ matches: systemDark }));
  }
  vm.runInNewContext(THEME_BOOTSTRAP_CODE, {
    document: { documentElement: root },
    window,
  });
  return { classes, localStorage, root, window };
}

describe("theme bootstrap contract", () => {
  it("uses the existing storage key and resolves system through matchMedia", () => {
    const result = executeBootstrap({ stored: "system", systemDark: true });
    expect(THEME_STORAGE_KEY).toBe("physiqueos-theme");
    expect(result.localStorage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(result.window.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(result.root.dataset).toEqual({ theme: "dark", themePreference: "system" });
    expect(result.classes).toContain("dark");
  });

  it.each([
    ["light", false],
    ["dark", true],
  ])("applies persisted %s mode before hydration", (stored, dark) => {
    const result = executeBootstrap({ stored, systemDark: !dark });
    expect(result.root.dataset.theme).toBe(stored);
    expect(result.root.dataset.themePreference).toBe(stored);
    expect(result.classes.has("dark")).toBe(dark);
  });

  it("falls back safely when localStorage is missing or throws", () => {
    const missing = executeBootstrap({ systemDark: true });
    delete missing.window.localStorage;
    const { root } = createRoot();
    expect(() => vm.runInNewContext(THEME_BOOTSTRAP_CODE, {
      document: { documentElement: root },
      window: { matchMedia: () => ({ matches: true }) },
    })).not.toThrow();
    expect(root.dataset).toEqual({ theme: "dark", themePreference: "system" });

    const blocked = executeBootstrap({ storageError: true, systemDark: false });
    expect(blocked.root.dataset).toEqual({ theme: "light", themePreference: "system" });
  });

  it("falls back safely when matchMedia is missing and normalizes invalid storage", () => {
    const result = executeBootstrap({ stored: "sepia", matchMedia: null });
    expect(result.root.dataset).toEqual({ theme: "light", themePreference: "system" });
    expect(result.classes).not.toContain("dark");
  });

  it("shares the same root class and data-attribute behavior with runtime application", () => {
    const { root, classes } = createRoot();
    expect(resolveThemePreference("system", () => ({ matches: true }))).toBe("dark");
    expect(readThemePreference({ getItem: () => "invalid" })).toBe("system");
    expect(readThemePreference({ getItem() { throw new Error("blocked"); } })).toBe("system");
    expect(applyThemePreference(root, "dark", null)).toEqual({ preference: "dark", resolved: "dark" });
    applyThemePreference(root, "light", null);
    expect(classes).not.toContain("dark");
    expect(root.dataset).toEqual({ theme: "light", themePreference: "light" });
  });
});

describe("RootLayout theme boundary", () => {
  const root = process.cwd();
  const instrumentationSource = fs.readFileSync(
    path.join(root, "src/instrumentation-client.js"),
    "utf8"
  );
  const switchSource = fs.readFileSync(path.join(root, "src/components/theme/ThemeSwitch.jsx"), "utf8");
  const layoutSource = fs.readFileSync(path.join(root, "src/app/layout.js"), "utf8");

  it("uses Next client instrumentation before hydration without rendering a script", () => {
    expect(instrumentationSource).toContain("readThemePreference");
    expect(instrumentationSource).toContain("applyThemePreference");
    expect(instrumentationSource).toContain("document.documentElement");
    expect(instrumentationSource).toContain("window.matchMedia?.bind(window)");
    expect(layoutSource).not.toContain('from "next/script"');
    expect(layoutSource).not.toMatch(/<script|<Script/);
    expect(layoutSource).not.toContain("<ThemeScript");
    expect(
      fs.existsSync(path.join(root, "src/components/theme/ThemeScript.jsx"))
    ).toBe(false);
  });

  it("keeps hydration suppression narrowly on html", () => {
    expect(layoutSource).toMatch(/<html[\s\S]*suppressHydrationWarning[\s\S]*<body>/);
    expect(layoutSource).not.toMatch(/<body[^>]*suppressHydrationWarning/);
  });

  it("preserves native keyboard controls, accessible names, and all three selections", () => {
    expect(switchSource).toContain('{ icon: Monitor, label: "System", value: "system" }');
    expect(switchSource).toContain('{ icon: Sun, label: "Light", value: "light" }');
    expect(switchSource).toContain('{ icon: Moon, label: "Dark", value: "dark" }');
    expect(switchSource).toContain('aria-label={`Use ${option.label} theme`}');
    expect(switchSource).toContain('type="button"');
  });

  it("does not introduce a founder-state or activation write boundary", () => {
    const combined = `${instrumentationSource}\n${switchSource}\n${layoutSource}`;
    expect(combined).not.toMatch(/ProductionGoalTransitionActivationService|GoalTransitionActivationCoordinator|FounderStoreUnitOfWork|ActivationStagedRepositoryFactory|Repository/);
  });
});
