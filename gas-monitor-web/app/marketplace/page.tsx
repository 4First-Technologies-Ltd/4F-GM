'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import ProductShowcase, { ShowcaseSlide } from '@/components/ProductShowcase';
import { formatNaira } from '@/lib/format';
import { LISTINGS, CATEGORY_LABEL, GAS_TYPE_LABEL, AREAS, SIZES, Category, GasType } from '@/lib/catalog';
import { IconSearch, IconFilter, IconClose, IconStar, IconMapPin, IconCheck } from '@/components/icons';

const MONITOR_SLIDES: ShowcaseSlide[] = [
  {
    src: '/products/4fg-monitor-cylinder.jpeg',
    alt: '4FG Monitor sensor base with a 12.5 kg cylinder on top, showing the live gas level display',
    tone: 'light'
  },
  {
    src: '/products/4fg-monitor-front.jpeg',
    alt: 'Front view of the 4FG Monitor IoT device showing gas level, connection, and status indicators',
    tone: 'dark'
  },
  {
    src: '/products/4fg-monitor-angles.jpeg',
    alt: 'The 4FG Monitor device shown from multiple angles',
    tone: 'dark'
  }
];

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
    <>
      <main>
        <SiteNav
          variant="solid"
          brandHref="/"
          links={[
            { href: '/', label: 'Home' },
            { href: '/about', label: 'About' },
            { href: '/marketplace', label: 'Marketplace', active: true },
            { href: '/downloads', label: 'Download' },
            { href: '/contact', label: 'Contact' },
            { href: '/partner', label: 'Partner with us' }
          ]}
        />

        {/* ---------- Marketplace hero with search ---------- */}
        <section className="market-hero">
          <div className="container market-hero-grid">
          <div className="market-hero-copy">
            <span className="badge badge-light">Vendor marketplace</span>
            <h1>Everything you need to keep the gas flowing</h1>
            <p>
              Refills, new cylinders, the 4FG Monitor sensor, and safety accessories from verified vendors near you.
            </p>

            <form
              className="market-search"
              role="search"
              onSubmit={(e) => e.preventDefault()}
            >
              <IconSearch className="market-search-icon" />
              <label htmlFor="market-search" className="sr-only">
                Search products, vendors, or locations
              </label>
              <input
                id="market-search"
                type="search"
                placeholder="Search products, vendors, or locations…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button type="button" className="market-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <IconClose />
                </button>
              )}
            </form>

            <div className="market-hero-chips" aria-label="Popular categories">
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`market-chip${categories.includes(cat) ? ' is-active' : ''}`}
                  aria-pressed={categories.includes(cat)}
                  onClick={() => toggleCategory(cat)}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>

            <dl className="market-hero-stats">
              <div>
                <dt>Verified vendors</dt>
                <dd>25+</dd>
              </div>
              <div>
                <dt>Orders delivered</dt>
                <dd>1,400+</dd>
              </div>
              <div>
                <dt>Avg. delivery time</dt>
                <dd>Under 3 hrs</dd>
              </div>
            </dl>
          </div>

          <aside className="market-hero-product" aria-labelledby="star-product-heading">
            <span className="star-product-flag">Star product</span>
            <ProductShowcase slides={MONITOR_SLIDES} />
            <div className="market-hero-product-info">
              <h2 id="star-product-heading">4FG Smart Gas Monitor</h2>
              <p>Know your exact gas level, get refill alerts, and reorder in one tap.</p>
              <div className="market-hero-product-foot">
                <div className="listing-price">
                  <span>From</span>
                  <strong>{formatNaira(45000)}</strong>
                </div>
                <a
                  href="/marketplace/l9"
                  className="btn btn-primary btn-sm"
                >
                  Order now
                </a>
              </div>
            </div>
          </aside>
          </div>
        </section>

        {/* ---------- Featured vendors ---------- */}
        <section className="section market-featured" aria-labelledby="featured-heading">
          <div className="container">
            <div className="market-featured-head">
              <h2 id="featured-heading">Featured suppliers</h2>
              <p className="section-sub">Top-rated vendors, verified by the 4FG team.</p>
            </div>
            <div className="featured-vendor-row">
              {featuredVendors.map((v) => (
                <div key={v.vendor} className="card featured-vendor-card">
                  <span className="featured-flag">Featured</span>
                  <div className="vendor-card-head">
                    <span className="vendor-avatar" style={{ background: v.color }} aria-hidden="true">
                      {v.initials}
                    </span>
                    <div className="vendor-card-heading">
                      <h3>{v.vendor}</h3>
                      <span className="vendor-rating">
                        <IconStar /> {v.rating.toFixed(1)} · {v.reviews} reviews
                      </span>
                    </div>
                  </div>
                  <p className="vendor-address">
                    <IconMapPin /> {v.location}
                  </p>
                  <div className="vendor-card-foot">
                    <span className={`status-pill ${v.isOpen ? 'status-confirmed' : 'status-cancelled'}`}>
                      {v.isOpen ? 'Open now' : v.hours}
                    </span>
                    <a href={`/marketplace/${v.id}`} className="btn btn-primary btn-sm">
                      Order now
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Filters + listings ---------- */}
        <section className="section market-browse" aria-labelledby="browse-heading">
          <div className="container market-layout">
            <button type="button" className="btn btn-secondary market-filter-toggle" onClick={() => setFiltersOpen(true)}>
              <IconFilter /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>

            {filtersOpen && <button type="button" className="market-filter-scrim" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />}

            <aside className={`market-filters${filtersOpen ? ' is-open' : ''}`} aria-label="Filter listings">
              <div className="market-filters-head">
                <h2 id="browse-heading">Filters</h2>
                {activeFilterCount > 0 && (
                  <button type="button" className="market-clear-btn" onClick={clearFilters}>
                    Clear all ({activeFilterCount})
                  </button>
                )}
                <button type="button" className="market-filters-close" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                  <IconClose />
                </button>
              </div>

              <fieldset className="filter-group">
                <legend>Shop by</legend>
                {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
                  <label key={cat} className="filter-check">
                    <input type="checkbox" checked={categories.includes(cat)} onChange={() => toggleCategory(cat)} />
                    <span className="filter-check-box" aria-hidden="true">
                      <IconCheck />
                    </span>
                    <span>{cat === 'refill' ? 'Buy gas (refill)' : cat === 'cylinder' ? 'Buy cylinder' : cat === 'monitor' ? 'Buy 4FG Monitor' : 'Accessories'}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="filter-group">
                <legend>Price</legend>
                {PRICE_BANDS.map((band) => (
                  <label key={band.id} className="filter-check filter-radio">
                    <input
                      type="radio"
                      name="price-band"
                      checked={priceBand === band.id}
                      onChange={() => setPriceBand(band.id)}
                    />
                    <span className="filter-radio-dot" aria-hidden="true" />
                    <span>{band.label}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="filter-group">
                <legend>Location</legend>
                <select className="filter-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filter by location">
                  <option value="all">All of Lagos</option>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </fieldset>

              <fieldset className="filter-group">
                <legend>Gas type</legend>
                {(Object.keys(GAS_TYPE_LABEL) as GasType[]).map((type) => (
                  <label key={type} className="filter-check">
                    <input type="checkbox" checked={gasTypes.includes(type)} onChange={() => toggleGasType(type)} />
                    <span className="filter-check-box" aria-hidden="true">
                      <IconCheck />
                    </span>
                    <span>{GAS_TYPE_LABEL[type]}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="filter-group">
                <legend>Cylinder size</legend>
                <select className="filter-select" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Filter by cylinder size">
                  <option value="all">Any size</option>
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </fieldset>

              <fieldset className="filter-group">
                <legend>Rating</legend>
                {[4.5, 4.0].map((r) => (
                  <label key={r} className="filter-check filter-radio">
                    <input type="radio" name="min-rating" checked={minRating === r} onChange={() => setMinRating(r)} />
                    <span className="filter-radio-dot" aria-hidden="true" />
                    <span>
                      <IconStar /> {r.toFixed(1)} & up
                    </span>
                  </label>
                ))}
                <label className="filter-check filter-radio">
                  <input type="radio" name="min-rating" checked={minRating === 0} onChange={() => setMinRating(0)} />
                  <span className="filter-radio-dot" aria-hidden="true" />
                  <span>Any rating</span>
                </label>
              </fieldset>

              <fieldset className="filter-group">
                <legend>Availability</legend>
                <label className="filter-check">
                  <input type="checkbox" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} />
                  <span className="filter-check-box" aria-hidden="true">
                    <IconCheck />
                  </span>
                  <span>Open now</span>
                </label>
              </fieldset>

              <button type="button" className="btn btn-primary btn-block market-filters-apply" onClick={() => setFiltersOpen(false)}>
                Show {results.length} result{results.length === 1 ? '' : 's'}
              </button>
            </aside>

            <div className="market-results">
              <div className="market-results-bar">
                <p className="market-results-count" aria-live="polite">
                  <strong>{results.length}</strong> result{results.length === 1 ? '' : 's'}
                  {query.trim() && (
                    <>
                      {' '}
                      for &ldquo;{query.trim()}&rdquo;
                    </>
                  )}
                </p>
                <label className="market-sort">
                  <span>Sort by</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    <option value="featured">Featured</option>
                    <option value="rating">Highest rated</option>
                    <option value="priceAsc">Price: low to high</option>
                    <option value="priceDesc">Price: high to low</option>
                  </select>
                </label>
              </div>

              {results.length === 0 ? (
                <div className="card market-empty">
                  <h3>No listings match your filters</h3>
                  <p>Try removing a filter or searching for something broader — e.g. &ldquo;refill&rdquo; or &ldquo;cylinder&rdquo;.</p>
                  <button type="button" className="btn btn-primary" onClick={() => { clearFilters(); setQuery(''); }}>
                    Clear search & filters
                  </button>
                </div>
              ) : (
                <div className="listing-grid">
                  {results.map((item) => (
                    <article key={item.id} className="card listing-card">
                      {item.image && (
                        <div className="listing-media">
                          <Image
                            src={item.image}
                            alt={item.title}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
                            style={{ objectFit: 'cover' }}
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="listing-card-top">
                        <span className="listing-category">{CATEGORY_LABEL[item.category]}</span>
                        {item.deliveryToday && <span className="listing-delivery">Same-day delivery</span>}
                      </div>
                      <h3 className="listing-title">
                        <a href={`/marketplace/${item.id}`} className="listing-title-link">
                          {item.title}
                        </a>
                      </h3>
                      <div className="listing-vendor">
                        <span className="vendor-avatar vendor-avatar-sm" style={{ background: item.color }} aria-hidden="true">
                          {item.initials}
                        </span>
                        <span className="listing-vendor-name">
                          {item.vendor}
                          {item.verified && (
                            <span className="verified-tick" title="Verified vendor" aria-label="Verified vendor">
                              <IconCheck />
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="listing-meta">
                        <span className="listing-rating">
                          <IconStar /> {item.rating.toFixed(1)}
                          <span className="listing-reviews">({item.reviews})</span>
                        </span>
                        <span className="listing-location">
                          <IconMapPin /> {item.area}
                        </span>
                      </p>
                      <div className="listing-foot">
                        <div className="listing-price">
                          <span>From</span>
                          <strong>{formatNaira(item.price)}</strong>
                        </div>
                        <a href={`/marketplace/${item.id}`} className="btn btn-primary btn-sm">
                          Order now
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
