/** The 4FGM emblem on the brand-green tile (public/brand/mark.png, same art as the favicon). */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/mark.png" alt="" aria-hidden="true" className={className} />
  );
}
