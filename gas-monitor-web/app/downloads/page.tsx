import Image from 'next/image';
import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import { IconCheck } from '@/components/icons';

const appHighlights = [
  'Real-Time Gas Level Monitoring',
  'Low Gas Notifications',
  'Usage Analytics & Refill Predictions',
  'One-Tap Vendor Ordering',
  'Accurate Weight-Based Measurement'
];

export default function DownloadsPage() {
  return (
    <>
      <main>
        <SiteNav
          variant="solid"
          brandHref="/"
          links={[
            { href: '/', label: 'Home' },
            { href: '/marketplace', label: 'Marketplace' },
            { href: '/downloads', label: 'Download', active: true },
            { href: '/contact', label: 'Contact' },
            { href: '/partner', label: 'Partner with us' }
          ]}
        />

        <section className="section marketplace-intro">
          <div className="container">
            <span className="badge">Mobile app</span>
            <h1 className="marketplace-title">Take 4FG Monitor with you</h1>
            <p className="marketplace-sub">
              Monitor cylinders, get refill reminders, and track orders on the go. Our iOS and Android apps are on
              the way — leave your details and we&apos;ll let you know the moment they land. In the meantime, every
              feature is already available on the web portal.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="device-banner" aria-label="The 4FG Monitor device">
              <Image
                src="/products/4fg-monitor-front.jpeg"
                alt="Front view of the 4FG Monitor IoT device showing a live gas level of 12.5 kg, connection status, and indicator lights"
                width={1280}
                height={700}
                sizes="(max-width: 900px) 100vw, 1100px"
                priority
              />
            </div>
            <div className="card get-app-card">
              <div>
                <h2>Get notified at launch</h2>
                <p>Everything you&apos;ll get in the app, available today on the web:</p>
                <ul className="simple-list">
                  {appHighlights.map((item) => (
                    <li key={item}>
                      <IconCheck />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="get-app-badges">
                <span className="get-app-badge" aria-disabled="true">
                  <span className="get-app-badge-label">Coming soon to</span>
                  <strong>App Store</strong>
                </span>
                <span className="get-app-badge" aria-disabled="true">
                  <span className="get-app-badge-label">Coming soon to</span>
                  <strong>Google Play</strong>
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
