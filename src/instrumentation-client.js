import {
  applyThemePreference,
  readThemePreference,
} from "./components/theme/themeContract";

if (typeof document !== "undefined" && typeof window !== "undefined") {
  const preference = readThemePreference(window.localStorage);
  applyThemePreference(
    document.documentElement,
    preference,
    window.matchMedia?.bind(window)
  );
}
