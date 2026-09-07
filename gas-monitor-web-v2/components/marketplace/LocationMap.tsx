import { ExternalLink, MapPin } from 'lucide-react';

/**
 * Static map for a listing's address, rendered from OpenStreetMap's embed
 * endpoint — no API key, no client-side map library, and nothing to load on
 * pages that don't use it.
 *
 * Coordinates place the pin; the printed address is still the source of truth
 * for a customer, so it is shown alongside rather than replaced by the map.
 */
export function LocationMap({
  lat,
  lng,
  address,
  label,
  /** Half-width of the visible map box, in degrees. ~0.008 ≈ 1.5 km across. */
  span = 0.008
}: {
  lat: number;
  lng: number;
  address: string;
  label: string;
  span?: number;
}) {
  const bbox = [lng - span, lat - span / 2, lng + span, lat + span / 2].join(',');
  // The street line usually already names the city, so only append what is
  // actually missing rather than printing "Port Harcourt, Port Harcourt".
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const openInMaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <iframe
        title={`Map showing ${label}`}
        src={embed}
        loading="lazy"
        className="block h-56 w-full border-0"
      />
      <div className="flex flex-wrap items-start justify-between gap-2 border-t border-border/70 bg-card/60 p-3">
        <p className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          <span>{address}</span>
        </p>
        <a
          href={openInMaps}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Directions <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
