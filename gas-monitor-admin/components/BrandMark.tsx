/** The 4FG brand icon — same mark as the marketing site (landing/index.html). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="var(--accent)" />
      <g transform="translate(6 6)">
        <path
          d="M12 2c0 0-5 6-5 10.5a5 5 0 0010 0C17 8 12 2 12 2z"
          fill="#fff"
          fillOpacity="0.95"
        />
        <path d="M9 15.5a3 3 0 006 0" stroke="#2D7450" strokeOpacity="0.6" strokeWidth="1.5" fill="none" />
      </g>
    </svg>
  );
}
