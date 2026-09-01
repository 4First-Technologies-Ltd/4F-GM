'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  X,
  Star,
  MapPin,
  Check
} from 'lucide-react';
import { TiltCard } from '@/components/motion/tilt-card';
import { PhoneMockup } from '@/components/mobile/phone-mockup';
import { AnimatedBadge } from '@/components/motion/animated-badge';
import {
  LISTINGS,
  CATEGORY_LABEL,
  GAS_TYPE_LABEL,
  AREAS,
  SIZES,
  Category,
  GasType
} from '@/lib/catalog';
import { formatNaira } from '@/lib/format';

const PRICE_BANDS = [
  { id: 'all', label: 'Any price', min: 0, max: Infinity },
  { id: 'under10k', label: 'Under ₦10,000', min: 0, max: 10000 },
  { id: '10to40', label: '₦10,000 – ₦40,000', min: 10000, max: 40000 },
  { id: '40to90', label: '₦40,000 – ₦90,000', min: 40000, max: 90000 },
  { id: 'over90', label: 'Over ₦90,000', min: 90000, max: Infinity }
] as const;

type SortKey = 'featured' | 'rating' | 'priceAsc' | 'priceDesc';

export default function MarketplacePage() {
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [gasTypes, setGasTypes] = useState<GasType[]>([]);
  const [priceBand, setPriceBand] = useState<(typeof PRICE_BANDS)[number]['id']>('all');
  const [area, setArea] = useState<string>('all');
  const [size, setSize] = useState<string>('all');
  const [minRating, setMinRating] = useState(0);
  const [openNow, setOpenNow] = useState(false);
  const [sort, setSort] = useState<SortKey>('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);

  function toggleCategory(cat: Category) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  function toggleGasType(type: GasType) {
    setGasTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  const activeFilterCount =
    categories.length +
    gasTypes.length +
    (priceBand !== 'all' ? 1 : 0) +
    (area !== 'all' ? 1 : 0) +
    (size !== 'all' ? 1 : 0) +
    (minRating > 0 ? 1 : 0) +
    (openNow ? 1 : 0);

  function clearFilters() {
    setCategories([]);
    setGasTypes([]);
    setPriceBand('all');
    setArea('all');
    setSize('all');
    setMinRating(0);
    setOpenNow(false);
  }

  const results = useMemo(() => {
    const band = PRICE_BANDS.find((b) => b.id === priceBand)!;
    const q = query.trim().toLowerCase();
    const filtered = LISTINGS.filter((item) => {
      if (q && ![item.title, item.vendor, item.location, item.area, CATEGORY_LABEL[item.category]].some((v) => v.toLowerCase().includes(q))) {
        return false;
      }
      if (categories.length > 0 && !categories.includes(item.category)) return false;
      if (gasTypes.length > 0 && !item.gasTypes.some((t) => gasTypes.includes(t))) return false;
      if (item.price < band.min || item.price > band.max) return false;
      if (area !== 'all' && item.area !== area) return false;
      if (size !== 'all' && !item.sizes.includes(size)) return false;
      if (minRating > 0 && item.rating < minRating) return false;
      if (openNow && !item.isOpen) return false;
      return true;
    });
    const sorted = [...filtered];
    switch (sort) {
      case 'rating':
        sorted.sort((a, b) => b.rating - a.rating);
        break;
      case 'priceAsc':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'priceDesc':
        sorted.sort((a, b) => b.price - a.price);
        break;
      default:
        sorted.sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false) || b.rating - a.rating);
    }
    return sorted;
  }, [query, categories, gasTypes, priceBand, area, size, minRating, openNow, sort]);

  const featuredVendors = useMemo(() => {
    const seen = new Set<string>();
    return LISTINGS.filter((l) => l.featured && !seen.has(l.vendor) && seen.add(l.vendor));
  }, []);

  return (
    <main>
      {/* Hero Section */}
      <section className="border-b border-border/70 bg-gradient-to-b from-card/50 to-background px-6 py-20 sm:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <AnimatedBadge status="success" className="w-fit">
                Vendor marketplace
              </AnimatedBadge>

              <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
                Everything you need to keep the gas flowing
              </h1>

              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                Refills, new cylinders, the 4FG Monitor sensor, and safety accessories from verified vendors near you.
              </p>

              {/* Search */}
              <div className="relative mt-8 max-w-2xl">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search products, vendors, or locations…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-border/70 bg-card/50 py-3 pl-12 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Category chips */}
              <div className="mt-6 flex flex-wrap gap-2">
                {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                      categories.includes(cat)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 bg-card/50 hover:border-primary/50'
                    }`}
                  >
                    {CATEGORY_LABEL[cat]}
                  </button>
                ))}
              </div>

              {/* Stats */}
              <div className="mt-8 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-semibold">25+</div>
                  <div className="text-sm text-muted-foreground">Verified vendors</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">1,400+</div>
                  <div className="text-sm text-muted-foreground">Orders delivered</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">Under 3 hrs</div>
                  <div className="text-sm text-muted-foreground">Avg. delivery time</div>
                </div>
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent blur-3xl" />
              <TiltCard max={8} glare className="relative z-10">
                <PhoneMockup
                  src="/images/mobile/marketplace.jpeg"
                  alt="Marketplace section showing verified vendors and refill ordering"
                />
              </TiltCard>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Vendors */}
      <section className="border-b border-border/70 px-6 py-20">
        <div className="mx-auto w-full max-w-7xl">
          <h2 className="text-3xl font-semibold">Featured suppliers</h2>
          <p className="mt-2 text-muted-foreground">Top-rated vendors, verified by the 4FG team.</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredVendors.map((v) => (
              <TiltCard
                key={v.vendor}
                max={6}
                glare={false}
                className="overflow-hidden border border-border/70 bg-card/50 backdrop-blur"
              >
                <div className="p-6">
                  <div className="flex items-start gap-3">
                    <div
                      className="grid h-12 w-12 place-items-center rounded-lg text-sm font-semibold text-white"
                      style={{ backgroundColor: v.color }}
                    >
                      {v.initials}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{v.vendor}</h3>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star size={12} className="fill-current" /> {v.rating.toFixed(1)} · {v.reviews} reviews
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin size={14} className="mt-0.5 shrink-0" />
                    {v.location}
                  </p>

                  <div className="mt-4 flex items-center justify-between">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      v.isOpen
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {v.isOpen ? 'Open now' : v.hours}
                    </span>
                    <Link
                      href={`/marketplace/${v.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Order now →
                    </Link>
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Browse Section */}
      <section className="px-6 py-20">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/50 px-4 py-2 text-sm font-medium hover:bg-card"
            >
              <Filter size={16} />
              Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            </button>
          </div>

          <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
            {/* Filters Sidebar */}
            <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>
              <div className="sticky top-24 space-y-6 rounded-lg border border-border/70 bg-card/50 p-6 backdrop-blur">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Filters</h3>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear all ({activeFilterCount})
                    </button>
                  )}
                </div>

                {/* Category Filter */}
                <fieldset className="space-y-3 border-t border-border/70 pt-4">
                  <legend className="text-sm font-medium">Shop by</legend>
                  {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
                    <label key={cat} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={categories.includes(cat)}
                        onChange={() => toggleCategory(cat)}
                        className="h-4 w-4 rounded border-border/70"
                      />
                      {CATEGORY_LABEL[cat]}
                    </label>
                  ))}
                </fieldset>

                {/* Price Filter */}
                <fieldset className="space-y-3 border-t border-border/70 pt-4">
                  <legend className="text-sm font-medium">Price</legend>
                  {PRICE_BANDS.map((band) => (
                    <label key={band.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="price-band"
                        checked={priceBand === band.id}
                        onChange={() => setPriceBand(band.id)}
                        className="h-4 w-4 rounded-full border-border/70"
                      />
                      {band.label}
                    </label>
                  ))}
                </fieldset>

                {/* Location Filter */}
                <fieldset className="border-t border-border/70 pt-4">
                  <legend className="mb-3 text-sm font-medium">Location</legend>
                  <select
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full rounded border border-border/70 bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All of Lagos</option>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </fieldset>

                {/* Gas Type Filter */}
                <fieldset className="space-y-3 border-t border-border/70 pt-4">
                  <legend className="text-sm font-medium">Gas type</legend>
                  {(Object.keys(GAS_TYPE_LABEL) as GasType[]).map((type) => (
                    <label key={type} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={gasTypes.includes(type)}
                        onChange={() => toggleGasType(type)}
                        className="h-4 w-4 rounded border-border/70"
                      />
                      {GAS_TYPE_LABEL[type]}
                    </label>
                  ))}
                </fieldset>

                {/* Size Filter */}
                <fieldset className="border-t border-border/70 pt-4">
                  <legend className="mb-3 text-sm font-medium">Cylinder size</legend>
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="w-full rounded border border-border/70 bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">Any size</option>
                    {SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </fieldset>

                {/* Rating Filter */}
                <fieldset className="space-y-3 border-t border-border/70 pt-4">
                  <legend className="text-sm font-medium">Rating</legend>
                  {[4.5, 4.0].map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="min-rating"
                        checked={minRating === r}
                        onChange={() => setMinRating(r)}
                        className="h-4 w-4 rounded-full border-border/70"
                      />
                      <Star size={12} className="fill-current" /> {r.toFixed(1)} & up
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="min-rating"
                      checked={minRating === 0}
                      onChange={() => setMinRating(0)}
                      className="h-4 w-4 rounded-full border-border/70"
                    />
                    Any rating
                  </label>
                </fieldset>

                {/* Availability Filter */}
                <fieldset className="border-t border-border/70 pt-4">
                  <legend className="mb-3 text-sm font-medium">Availability</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={openNow}
                      onChange={(e) => setOpenNow(e.target.checked)}
                      className="h-4 w-4 rounded border-border/70"
                    />
                    Open now
                  </label>
                </fieldset>

                <button
                  onClick={() => setFiltersOpen(false)}
                  className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 lg:hidden"
                >
                  Show {results.length} result{results.length === 1 ? '' : 's'}
                </button>
              </div>
            </aside>

            {/* Results */}
            <div>
              <div className="mb-6 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <strong>{results.length}</strong> result{results.length === 1 ? '' : 's'}
                  {query.trim() && (
                    <>
                      {' '}
                      for &ldquo;{query.trim()}&rdquo;
                    </>
                  )}
                </p>
                <div>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="rounded border border-border/70 bg-card/50 px-3 py-2 text-sm"
                  >
                    <option value="featured">Featured</option>
                    <option value="rating">Highest rated</option>
                    <option value="priceAsc">Price: low to high</option>
                    <option value="priceDesc">Price: high to low</option>
                  </select>
                </div>
              </div>

              {results.length === 0 ? (
                <div className="rounded-lg border border-border/70 bg-card/50 p-12 text-center">
                  <h3 className="text-lg font-semibold">No listings match your filters</h3>
                  <p className="mt-2 text-muted-foreground">
                    Try removing a filter or searching for something broader — e.g. &ldquo;refill&rdquo; or &ldquo;cylinder&rdquo;.
                  </p>
                  <button
                    onClick={() => {
                      clearFilters();
                      setQuery('');
                    }}
                    className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Clear search & filters
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {results.map((item) => (
                    <TiltCard
                      key={item.id}
                      max={6}
                      glare={false}
                      className="overflow-hidden border border-border/70 bg-card/50 backdrop-blur"
                    >
                      <Link href={`/marketplace/${item.id}`} className="block p-5">
                        <div className="flex items-start justify-between">
                          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                            {CATEGORY_LABEL[item.category]}
                          </span>
                          {item.deliveryToday && (
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                              Same-day
                            </span>
                          )}
                        </div>

                        <h3 className="mt-4 font-semibold line-clamp-2">
                          {item.title}
                        </h3>

                        <div className="mt-3 flex items-center gap-2">
                          <div
                            className="grid h-8 w-8 place-items-center rounded text-xs font-semibold text-white"
                            style={{ backgroundColor: item.color }}
                          >
                            {item.initials}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.vendor}</p>
                            <span className="text-xs text-muted-foreground">
                              {item.verified && (
                                <span className="inline-flex items-center gap-1">
                                  <Check size={10} className="inline" /> Verified
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Star size={12} className="fill-current" /> {item.rating.toFixed(1)}
                            <span className="text-muted-foreground">({item.reviews})</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin size={12} /> {item.area}
                          </span>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-4">
                          <div>
                            <p className="text-xs text-muted-foreground">From</p>
                            <p className="font-semibold">{formatNaira(item.price)}</p>
                          </div>
                          <span className="text-sm font-medium text-primary hover:underline">
                            Order now →
                          </span>
                        </div>
                      </Link>
                    </TiltCard>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
