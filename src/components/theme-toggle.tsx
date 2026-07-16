"use client";

// Quiet, header-appropriate theme control — a 3-segment switch for Light / Dark / System.
// Persists to localStorage ("rung-theme") and stamps (or clears) data-theme on <html> so the
// CSS-variable token system in globals.css flips instantly. No dark: variants, no hardcoded colors.
import { useEffect, useState } from "react";

type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "rung-theme";

function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="3" strokeWidth="1.5" />
      <path
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="8.5" rx="1" strokeWidth="1.5" />
      <path strokeWidth="1.5" strokeLinecap="round" d="M5.5 14h5M8 11v3" />
    </svg>
  );
}

const OPTIONS: { value: ThemePreference; label: string; icon: () => React.JSX.Element }[] = [
  { value: "light", label: "Light theme", icon: SunIcon },
  { value: "dark", label: "Dark theme", icon: MoonIcon },
  { value: "system", label: "Match system theme", icon: SystemIcon }
];

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setPreference(stored);
    }
    setMounted(true);
  }, []);

  function choose(pref: ThemePreference) {
    setPreference(pref);
    window.localStorage.setItem(STORAGE_KEY, pref);
    applyTheme(pref);
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = mounted && preference === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={() => choose(value)}
            className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
              selected ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
