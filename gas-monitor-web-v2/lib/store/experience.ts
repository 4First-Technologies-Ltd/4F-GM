"use client";

import { create } from "zustand";

export type QualityTier = "high" | "medium" | "low" | "off";

export type ExperienceState = {
  /** Global page scroll progress, 0..1, written by SmoothScroll. */
  scroll: number;
  /** Progress within the currently pinned scrollytelling section, 0..1. */
  sceneProgress: number;
  /** Index of the active narrative beat (product page). */
  beat: number;
  /** Normalized pointer position, -1..1 on each axis, eased. */
  pointer: { x: number; y: number };
  /** Gas level the hero motif visualises, 0..1. */
  level: number;
  /** Resolved rendering tier. `off` means render the poster fallback. */
  quality: QualityTier;
  reducedMotion: boolean;

  setScroll: (v: number) => void;
  setSceneProgress: (v: number) => void;
  setBeat: (v: number) => void;
  setPointer: (x: number, y: number) => void;
  setLevel: (v: number) => void;
  setQuality: (q: QualityTier) => void;
  setReducedMotion: (v: boolean) => void;
};

export const useExperience = create<ExperienceState>((set) => ({
  scroll: 0,
  sceneProgress: 0,
  beat: 0,
  pointer: { x: 0, y: 0 },
  level: 0.62,
  quality: "high",
  reducedMotion: false,

  setScroll: (v) => set({ scroll: v }),
  setSceneProgress: (v) => set({ sceneProgress: v }),
  setBeat: (v) => set({ beat: v }),
  setPointer: (x, y) => set({ pointer: { x, y } }),
  setLevel: (v) => set({ level: Math.min(1, Math.max(0, v)) }),
  setQuality: (q) => set({ quality: q }),
  setReducedMotion: (v) => set({ reducedMotion: v }),
}));

/** Non-reactive read for use inside useFrame (avoids re-renders). */
export const readExperience = useExperience.getState;
