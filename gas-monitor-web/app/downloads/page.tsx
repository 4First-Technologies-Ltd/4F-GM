import NavAuthActions from '@/components/NavAuthActions';
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
        <header className="site-header">
          <div className="container navbar-row">
            <a className="brand" href="/">
              <span className="brand-mark">4F</span>
              <span>4FG Smart Gas Monitor</span>
            </a>
            <div className="nav-links">
              <a href="/#features">Features</a>
              <a href="/marketplace">Marketplace</a>
              <a href="/downloads" className="active">Download</a>
              <a href="/#contact">Contact</a>
            </div>
            <NavAuthActions />
          </div>
        </header>

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
