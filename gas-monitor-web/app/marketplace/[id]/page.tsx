'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import { formatNaira } from '@/lib/format';
import { getListing, CATEGORY_LABEL, MAX_QUANTITY } from '@/lib/catalog';
import { IconStar, IconMapPin, IconCheck, IconPackage } from '@/components/icons';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/marketplace', label: 'Marketplace', active: true },
  { href: '/downloads', label: 'Download' },
  { href: '/contact', label: 'Contact' },
  { href: '/partner', label: 'Partner with us' }
];

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const item = getListing(params.id);

  const gallery = useMemo(() => {
    if (!item) return [];
    if (item.gallery && item.gallery.length > 0) return item.gallery;
    if (item.image) return [{ src: item.image, alt: item.title, tone: 'dark' as const }];
    return [];
  }, [item]);

  const [activeImage, setActiveImage] = useState(0);
  const [size, setSize] = useState(() => item?.sizes[0] ?? '');
  const [quantity, setQuantity] = useState(1);

  if (!item) {
    return (
      <>
        <main>
          <SiteNav variant="solid" brandHref="/" links={NAV_LINKS} />
          <section className="section">
            <div className="container checkout-container">
              <div className="card market-empty">
                <h3>Product not found</h3>
                <p>This listing may have been removed. Browse the marketplace for current offers.</p>
                <a href="/marketplace" className="btn btn-primary">
                  Back to marketplace
                </a>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const subtotal = item.price * quantity;

  function handlePayNow() {
    router.push(`/checkout?item=${item!.id}&size=${encodeURIComponent(size)}&qty=${quantity}`);
  }

  return (
    <>
      <main>
        <SiteNav variant="solid" brandHref="/" links={NAV_LINKS} />

        <section className="section pdp-section">
          <div className="container">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <a href="/marketplace">Marketplace</a>
              <span aria-hidden="true">/</span>
              <a href="/marketplace">{CATEGORY_LABEL[item.category]}</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{item.title}</span>
            </nav>

            <div className="pdp-grid">
              {/* ---------- Gallery ---------- */}
              <div className="pdp-gallery">
                {gallery.length > 0 ? (
                  <>
                    <div className={`pdp-gallery-main is-${gallery[activeImage].tone}`}>
                      <Image
                        src={gallery[activeImage].src}
                        alt={gallery[activeImage].alt}
                        fill
                        sizes="(max-width: 900px) 100vw, 560px"
                        style={{ objectFit: 'contain' }}
                        priority
                      />
                    </div>
                    {gallery.length > 1 && (
                      <div className="pdp-thumbs" role="tablist" aria-label="Product images">
                        {gallery.map((img, i) => (
                          <button
                            key={img.src}
                            type="button"
                            role="tab"
                            aria-selected={i === activeImage}
                            aria-label={`Image ${i + 1}: ${img.alt}`}
                            className={`pdp-thumb is-${img.tone}${i === activeImage ? ' is-active' : ''}`}
                            onClick={() => setActiveImage(i)}
                          >
                            <Image src={img.src} alt="" fill sizes="90px" style={{ objectFit: 'contain' }} />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="pdp-gallery-main pdp-gallery-placeholder" aria-hidden="true">
                    <span className="vendor-avatar pdp-placeholder-avatar" style={{ background: item.color }}>
                      {item.initials}
                    </span>
                    <IconPackage />
                    <span className="pdp-placeholder-note">Photo coming soon</span>
                  </div>
                )}
              </div>

              {/* ---------- Buy panel ---------- */}
              <div className="pdp-info">
                <div className="listing-card-top">
                  <span className="listing-category">{CATEGORY_LABEL[item.category]}</span>
                  {item.deliveryToday && <span className="listing-delivery">Same-day delivery</span>}
                </div>

                <h1 className="pdp-title">{item.title}</h1>

                <div className="pdp-vendor-row">
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
                  <span className="listing-rating">
                    <IconStar /> {item.rating.toFixed(1)}
                    <span className="listing-reviews">({item.reviews} reviews)</span>
                  </span>
                </div>

                <p className="pdp-location">
                  <IconMapPin /> {item.location}
                  <span className={`status-pill ${item.isOpen ? 'status-confirmed' : 'status-cancelled'}`}>
                    {item.isOpen ? 'Open now' : item.hours}
                  </span>
                </p>

                <p className="pdp-description">{item.description}</p>

                <div className="pdp-price-row">
                  <strong className="pdp-price">{formatNaira(item.price)}</strong>
                  <span className="pdp-price-unit">per unit</span>
                </div>

                <div className="pdp-options">
                  <div className="field">
                    <label htmlFor="pdp-size">Size / variant</label>
                    <select id="pdp-size" value={size} onChange={(e) => setSize(e.target.value)}>
                      {item.sizes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="pdp-qty">Quantity</label>
                    <div className="qty-stepper">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <input
                        id="pdp-qty"
                        type="number"
                        min={1}
                        max={MAX_QUANTITY}
                        value={quantity}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Math.round(v))));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                        disabled={quantity >= MAX_QUANTITY}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <span className="field-help">Up to {MAX_QUANTITY} per order</span>
                  </div>
                </div>

                <div className="pdp-subtotal" aria-live="polite">
                  <span>Subtotal ({quantity} {quantity === 1 ? 'unit' : 'units'})</span>
                  <strong>{formatNaira(subtotal)}</strong>
                </div>

                <button type="button" className="btn btn-primary btn-block pdp-pay-btn" onClick={handlePayNow}>
                  Pay now · {formatNaira(subtotal)}
                </button>

                <ul className="pdp-trust">
                  <li>
                    <IconCheck /> Verified vendor, vetted by the 4FG team
                  </li>
                  <li>
                    <IconCheck /> Secure payment via Paystack — card details never stored
                  </li>
                  <li>
                    <IconCheck /> Track your delivery from your dashboard
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
