"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyThemePreference,
  readThemePreference,
  writeThemePreference,
} from "./themeContract";

const options = [
  { icon: Monitor, label: "System", value: "system" },
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" },
];

export default function ThemeSwitch() {
  const [theme, setTheme] = useState("system");

  useEffect(() => {
    const storedTheme = readThemePreference(window.localStorage);
    applyTheme(storedTheme);
    const stateSyncTimer = window.setTimeout(() => {
      setTheme(storedTheme);
    }, 0);

    const media = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
    const onChange = () => {
      if (readThemePreference(window.localStorage) === "system") {
        applyTheme("system");
      }
    };

    media?.addEventListener?.("change", onChange);

    return () => {
      window.clearTimeout(stateSyncTimer);
      media?.removeEventListener?.("change", onChange);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function selectTheme(nextTheme) {
    setTheme(nextTheme);
    writeThemePreference(window.localStorage, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <div className="theme-switch fixed right-3 top-3 z-[80] flex rounded-full p-1 backdrop-blur">
      {options.map((option) => {
        const Icon = option.icon;

        return (
          <button
            aria-label={`Use ${option.label} theme`}
            className="grid h-8 w-8 place-items-center rounded-full transition"
            data-active={theme === option.value}
            key={option.value}
            onClick={() => selectTheme(option.value)}
            type="button"
          >
            <Icon aria-hidden="true" size={15} strokeWidth={2.4} />
          </button>
        );
      })}
    </div>
  );
}

function applyTheme(theme) {
  document.documentElement.classList.add("theme-transition");
  applyThemePreference(document.documentElement, theme, window.matchMedia?.bind(window));
  window.setTimeout(() => {
    document.documentElement.classList.remove("theme-transition");
  }, 220);
}
