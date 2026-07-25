export const THEME_STORAGE_KEY = "physiqueos-theme";
export const DEFAULT_THEME_PREFERENCE = "system";
export const THEME_PREFERENCES = new Set(["system", "light", "dark"]);

export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.has(value) ? value : DEFAULT_THEME_PREFERENCE;
}

export function readThemePreference(storage) {
  try {
    return normalizeThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(storage, preference) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, normalizeThemePreference(preference));
  } catch {
    // Theme selection remains effective for the current page when storage is unavailable.
  }
}

export function resolveThemePreference(preference, matchMedia) {
  const normalized = normalizeThemePreference(preference);
  if (normalized !== "system") return normalized;

  try {
    return matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyThemePreference(root, preference, matchMedia) {
  const normalized = normalizeThemePreference(preference);
  const resolved = resolveThemePreference(normalized, matchMedia);

  root?.classList?.toggle("dark", resolved === "dark");
  if (root?.dataset) {
    root.dataset.theme = resolved;
    root.dataset.themePreference = normalized;
  }

  return { preference: normalized, resolved };
}

export const THEME_BOOTSTRAP_CODE = `
(function () {
  var preference = "system";
  try {
    var stored = window.localStorage && window.localStorage.getItem("physiqueos-theme");
    if (stored === "system" || stored === "light" || stored === "dark") preference = stored;
  } catch (error) {}

  var resolved = preference;
  if (preference === "system") {
    try {
      resolved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch (error) {
      resolved = "light";
    }
  }

  var root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
})();`;
