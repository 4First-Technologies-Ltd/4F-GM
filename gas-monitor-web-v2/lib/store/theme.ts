"use client";

import { create } from "zustand";
import {
  DARK_QUERY,
  DEFAULT_PREFERENCE,
  nextPreference,
  paintTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemTheme,
  type Theme,
  type ThemePreference,
} from "@/lib/theme";

export type ThemeState = {
  /** What the visitor picked — may be `system`. */
  preference: ThemePreference;
  /** What is actually painted right now. */
  theme: Theme;
  /** False until the client has read the real value. */
  ready: boolean;
  hydrate: () => void;
  setPreference: (preference: ThemePreference) => void;
  /** Advance system → light → dark → system. */
  cycle: () => void;
};

let watching = false;

export const useTheme = create<ThemeState>((set, get) => ({
  preference: DEFAULT_PREFERENCE,
  theme: "dark",
  ready: false,

  hydrate: () => {
    const preference = readStoredPreference();
    set({ preference, theme: resolveTheme(preference), ready: true });

    if (watching || typeof window === "undefined") return;
    watching = true;
    // Follow the OS live, but only while the visitor is on `system`.
    window.matchMedia(DARK_QUERY).addEventListener("change", () => {
      if (get().preference !== "system") return;
      const theme = systemTheme();
      paintTheme(theme);
      set({ theme });
    });
  },

  setPreference: (preference) => {
    const theme = resolveTheme(preference);
    storePreference(preference);
    paintTheme(theme);
    set({ preference, theme, ready: true });
  },

  cycle: () => get().setPreference(nextPreference(get().preference)),
}));

/** Non-reactive read for use inside useFrame (avoids re-renders). */
export const readTheme = useTheme.getState;
