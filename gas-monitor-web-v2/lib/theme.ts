/** What the visitor picked. `system` follows the OS setting live. */
export type ThemePreference = "light" | "dark" | "system";

/** What actually gets painted. */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "4fg-theme";

/** No stored choice means follow the operating system. */
export const DEFAULT_PREFERENCE: ThemePreference = "system";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs before first paint (injected as a blocking inline script in the root
 * layout) so the right theme is on <html> before anything is drawn. The
 * server renders `class="dark"`, so this only has to strip it for light.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var p=localStorage.getItem(k);var t=(p==="light"||p==="dark")?p:(window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light");var e=document.documentElement;e.classList.toggle("dark",t==="dark");e.style.colorScheme=t;}catch(err){}})();`;

export function systemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Storage blocked (private mode) — fall through to the default.
  }
  return DEFAULT_PREFERENCE;
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

/** Paints a resolved theme onto <html>. */
export function paintTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.style.colorScheme = theme;
}

export function storePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage blocked — the choice still applies for this visit.
  }
}

/** Toggle order: system → light → dark → system. */
export function nextPreference(current: ThemePreference): ThemePreference {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
