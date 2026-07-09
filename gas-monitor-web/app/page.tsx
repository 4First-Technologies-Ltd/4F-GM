import HeroSlider from '@/components/HeroSlider';
import NavAuthActions from '@/components/NavAuthActions';
import { IconCheck } from '@/components/icons';

const features = [
  { title: 'Live cylinder insights', text: 'Track gas levels, refill forecasts, and reminder thresholds in one clean dashboard.' },
  { title: 'Vendor marketplace', text: 'Find nearby suppliers, compare prices, and place orders with confidence.' },
  { title: 'Secure account flow', text: 'Support for consumer and vendor roles with a modern authentication experience.' }
];

const activity = [
  { label: 'Refill readiness', value: '82%' },
  { label: 'Next refill ETA', value: '3 days' },
  { label: 'Nearby vendors', value: '14' }
];

const heroChecklist = [
  'Real-Time Gas Level Monitoring',
  'Low Gas Notifications',
  'Usage Analytics & Refill Predictions',
  'Mobile App Access Anywhere',
  'Accurate Weight-Based Measurement'
];

export default function HomePage() {
  return (
    <main>
      <nav className="navbar">
        <div className="container navbar-row">
          <a className="brand" href="#">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>
          <div className="nav-links">
            <a href="#features" className="active">Features</a>
            <a href="/marketplace">Marketplace</a>
            <a href="#insights">Insights</a>
            <a href="#contact">Contact</a>
          </div>
          <NavAuthActions />
        </div>
      </nav>

      <section className="hero">
        <HeroSlider />

        <div className="container hero-content">
          <div className="hero-copy">
            <h1 className="hero-title-sentence">The Smart Way to Monitor Your LPG Cylinder</h1>
            <p className="hero-tagline">Know exactly how much gas you have left—anytime, anywhere.</p>
            <ul className="hero-checklist">
              {heroChecklist.map((item) => (
                <li key={item}>
                  <IconCheck className="hero-checklist-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="hero-actions">
              <a href="/marketplace" className="btn btn-primary">Order now</a>
              <a href="#get-app" className="btn btn-secondary">Download app</a>
            </div>
          </div>

          <div className="card hero-card">
            <div className="hero-card-tabs">
              <span className="pill">Home</span>
              <span className="pill">Vendor</span>
              <span className="pill pill-active">Live</span>
            </div>
            <h3>Real-time cylinder insight</h3>
            <p className="hero-card-sub">From sensor to dashboard, instantly.</p>

            <div className="hero-card-visual">
              <div className="cylinder-dot" style={{ top: '18%', left: '38%' }} />
              <div className="cylinder-dot" style={{ top: '52%', left: '58%' }} />
              <div className="cylinder-dot" style={{ top: '74%', left: '30%' }} />
              <div className="hero-card-flyout">
                <span className="flyout-label">LIVE READING</span>
                <div className="flyout-body">
                  <strong>82%</strong>
                  <span>Cylinder A2</span>
                </div>
              </div>
            </div>

            <div className="metrics">
              {activity.map((item) => (
                <div key={item.label} className="metric">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <div className="container">
          <h2>Core capabilities</h2>
          <div className="grid-3">
            {features.map((feature) => (
              <div key={feature.title} className="card">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="get-app" className="section">
        <div className="container">
          <div className="card get-app-card">
            <div>
              <h2>Get the 4FG app</h2>
              <p>
                Monitor cylinders, get refill reminders, and track orders on the go. Our iOS and Android apps are on
                the way — leave your email and we&apos;ll let you know the moment they land.
              </p>
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

      <section id="contact" className="section">
        <div className="container">
          <div className="card">
            <h2>Sign in to see it live</h2>
            <p>
              This portal is wired into the same 4FG backend as the mobile app — real authentication, a live orders
              dashboard, and Paystack checkout. <a className="link-underline" href="/sign-up">Create an account</a> or{' '}
              <a className="link-underline" href="/sign-in">sign in</a> to try it.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
