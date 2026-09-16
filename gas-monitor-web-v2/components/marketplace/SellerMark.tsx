import Image from 'next/image';
import type { Listing } from '@/lib/catalog';
import { cn } from '@/lib/utils';

interface SellerMarkProps {
  listing: Pick<Listing, 'vendor' | 'logo' | 'color' | 'initials'>;
  /** Size and corner radius, e.g. `h-12 w-12 rounded-lg`. */
  className?: string;
  /** Text size for the initials fallback. */
  textClassName?: string;
  /** Rendered pixel size, used to pick the optimised image. */
  size: number;
}

/**
 * A seller's brand mark: their logo when they have one, otherwise initials on
 * their brand colour. Logos sit on a transparent background, so no tile colour.
 */
export function SellerMark({ listing, className, textClassName = 'text-xs', size }: SellerMarkProps) {
  if (listing.logo) {
    return (
      <Image
        src={listing.logo}
        alt={`${listing.vendor} logo`}
        width={size}
        height={size}
        className={cn('shrink-0 object-contain', className)}
      />
    );
  }

  // Painted with the seller's brand colour, so the initials need a fixed light
  // foreground rather than a themed one.
  return (
    <div
      className={cn('grid shrink-0 place-items-center font-semibold text-white', className, textClassName)}
      style={{ backgroundColor: listing.color }}
      aria-hidden
    >
      {listing.initials}
    </div>
  );
}
