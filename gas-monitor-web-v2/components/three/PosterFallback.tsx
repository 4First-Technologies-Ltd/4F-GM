"use client";

/**
 * Shown instead of the WebGL scene when the tier resolves to `off`
 * (reduced motion, no WebGL). Pure CSS, no animation. Colours come from the
 * theme tokens so it works in light and dark.
 */
export function PosterFallback() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 30%, color-mix(in oklab, var(--primary) 28%, transparent), transparent 70%)," +
          "radial-gradient(50% 40% at 80% 80%, color-mix(in oklab, var(--accent) 20%, transparent), transparent 70%)," +
          "linear-gradient(180deg, var(--background) 0%, var(--secondary) 100%)",
      }}
    >
      <div
        className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full"
        style={{
          background:
            "conic-gradient(from 180deg, var(--primary), var(--chart-3), var(--accent), var(--primary))",
          filter: "blur(60px)",
          opacity: 0.5,
        }}
      />
    </div>
  );
}
