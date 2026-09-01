"use client";

/**
 * Shown instead of the WebGL scene when the tier resolves to `off`
 * (reduced motion, no WebGL). Pure CSS, no animation.
 */
export function PosterFallback() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 30%, rgba(45,116,80,0.28), transparent 70%)," +
          "radial-gradient(50% 40% at 80% 80%, rgba(169,113,76,0.20), transparent 70%)," +
          "linear-gradient(180deg, #edf7ed 0%, #dcebdc 100%)",
      }}
    >
      <div
        className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full"
        style={{
          background:
            "conic-gradient(from 180deg, #2d7450, #7bf5b4, #a9714c, #2d7450)",
          filter: "blur(60px)",
          opacity: 0.5,
        }}
      />
    </div>
  );
}
