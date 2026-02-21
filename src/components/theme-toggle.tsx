"use client";

type ThemeMode = "dark" | "light";

const STORAGE_KEY = "magiclogic-theme";

function SunIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.2 2.2M16.8 16.8L19 19M19 5l-2.2 2.2M7.2 16.8L5 19"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M20 14.2a8 8 0 1 1-10.2-10A6.8 6.8 0 0 0 20 14.2z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function readThemeFromDom(): ThemeMode {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const toggleTheme = () => {
    const current = readThemeFromDom();
    const next: ThemeMode = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // no-op if storage is unavailable
    }
  };

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <span className="theme-icon theme-icon--dark">
        <MoonIcon />
      </span>
      <span className="theme-icon theme-icon--light">
        <SunIcon />
      </span>
    </button>
  );
}
