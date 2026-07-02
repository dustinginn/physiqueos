"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const options = [
  { icon: Monitor, label: "System", value: "system" },
  { icon: Sun, label: "Light", value: "light" },
  { icon: Moon, label: "Dark", value: "dark" },
];

export default function ThemeSwitch() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "system";

    return window.localStorage.getItem("physiqueos-theme") ?? "system";
  });

  useEffect(() => {
    applyTheme(theme);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((window.localStorage.getItem("physiqueos-theme") ?? "system") === "system") {
        applyTheme("system");
      }
    };

    media.addEventListener("change", onChange);

    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function selectTheme(nextTheme) {
    setTheme(nextTheme);
    window.localStorage.setItem("physiqueos-theme", nextTheme);
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
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  document.documentElement.classList.add("theme-transition");
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = theme;
  window.setTimeout(() => {
    document.documentElement.classList.remove("theme-transition");
  }, 220);
}
