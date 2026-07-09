import HeroSlider from '@/components/HeroSlider';
import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import { IconCheck, IconMinusCircle, IconStar, IconChevronDown } from '@/components/icons';

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
  'Live Percentage and KG Update Notification',
  'Usage Analytics & Refill Predictions',
  'Mobile App Access Anywhere',
  'Accurate Weight-Based Measurement'
];

const goals = [
  {
    title: 'Nationwide coverage',
    text: 'Bringing real-time gas monitoring to homes and businesses across Nigeria, then expanding across West Africa.',
    cta: { label: 'Partner with us', href: '/partner#distributor' }
  },
  {
    title: 'A trusted vendor network',
    text: 'Onboarding certified gas suppliers city by city, so every order ships from someone we vouch for.',
    cta: { label: 'Partner with us', href: '/partner#gas-station' }
  },
  { title: 'Smarter every day', text: 'Our AI refill predictions improve with every household that joins. The goal is a model that just knows.' }
];

const steps = [
  { title: 'Place your cylinder on the sensor', text: 'No clipping, no Bluetooth pairing, just set the cylinder on the base plate.' },
  { title: 'Connect your account', text: 'Sign in on the app or here on the web portal and the sensor syncs automatically.' },
  { title: 'Get alerts & order refills', text: 'See live levels, get AI refill predictions, and order from a verified vendor in one tap.' }
];

const compareRows = [
  { feature: 'Real-time level tracking', traditional: false, fourFg: 'Live percentage, updated continuously' },
  { feature: 'Predicts your refill date', traditional: false, fourFg: 'AI-powered, based on your usage' },
  { feature: 'Usage Analytics and Prediction', traditional: false, fourFg: 'Consumption trends and refill forecasts' },
  { feature: 'Alerts before you run out', traditional: false, fourFg: 'Push & email notifications' },
  { feature: 'Order refills without leaving the app', traditional: false, fourFg: 'Verified vendor marketplace' },
  { feature: 'Setup time', traditional: 'N/A', fourFg: 'Under 3 minutes' }
];

const testimonials = [
  { quote: "We used to run out of gas at least twice a month. Since installing the sensor, we haven't run out once.", name: 'Adaeze O.', role: 'Homeowner, Lagos' },
  { quote: 'I placed an order at 11pm and had gas delivered by 8am. Completely changed how I manage cooking fuel for the restaurant.', name: 'Kwame A.', role: 'Restaurant owner, Accra' },
  { quote: 'Setup took three minutes. The dashboard is easy to read and the alerts give us enough time to plan ahead.', name: 'Fatima Y.', role: 'Facilities manager, Abuja' }
];

const faqs = [
  { q: 'How does the sensor detect gas levels without Wi-Fi or Bluetooth?', a: 'The device uses precision weight-sensing hardware in its base plate — no pairing required on the cylinder side. It reports readings over its own connection to our servers, and you view them live in the app or on this web portal.' },
  { q: 'Which cylinder sizes are compatible?', a: 'The base plate fits standard 6kg, 12.5kg, and 25kg LPG cylinders used across most households and small businesses. Contact us if you have a non-standard size.' },
  { q: 'How accurate are the refill predictions?', a: "Our model learns your household's or business's actual usage rhythm over the first two weeks, then predicts your empty date from real consumption trends rather than a fixed schedule." },
  { q: "What happens if a vendor doesn't deliver on time?", a: 'Every vendor is rated and reviewed after each order. If a delivery is late or missing, our support team steps in and can help you reorder from another nearby vendor.' },
  { q: 'Is my payment information secure?', a: 'All payments are processed through Paystack, a PCI-DSS compliant processor. We never store your card details on our servers.' },
  { q: 'Do I need a subscription to use the sensor?', a: 'No — basic real-time monitoring is included with your device at no extra cost. AI insights and priority marketplace features are part of the Pro plan.' }
];

export default function HomePage() {
  return (
    <>
    <main>
      <SiteNav
        variant="transparent"
        brandHref="#"
        links={[
          { href: '#features', label: 'Features', active: true },
          { href: '#faq', label: 'FAQ' },
          { href: '/marketplace', label: 'Marketplace' },
          { href: '/downloads', label: 'Download' },
          { href: '#contact', label: 'Contact' },
          { href: '/partner', label: 'Partner with us' }
        ]}
      />

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
              <a href="/downloads" className="btn btn-secondary">Download app</a>
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

      <section id="how-it-works" className="section">
        <div className="container">
          <h2>How it works</h2>
          <div className="steps-grid" role="list">
            {steps.map((step, index) => (
              <div key={step.title} className="step-card" role="listitem">
                <div className="step-number" aria-hidden="true">{index + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="goals" className="section">
        <div className="container">
          <h2>Where we&apos;re headed</h2>
          <p className="section-sub">We&apos;re an early-stage startup — here&apos;s what we&apos;re building toward.</p>
          <div className="grid-3">
            {goals.map((goal) => (
              <div key={goal.title} className="card goal-card">
                <h3>{goal.title}</h3>
                <p>{goal.text}</p>
                {goal.cta && (
                  <a href={goal.cta.href} className="btn btn-primary goal-card-cta">
                    {goal.cta.label}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="compare" className="section">
        <div className="container">
          <h2>Why not just check the cylinder?</h2>
          <div className="compare-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Traditional gauge</th>
                  <th scope="col">4FG Monitor</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td>
                      <span className={`compare-cell ${row.traditional === false ? 'is-no' : ''}`}>
                        {row.traditional === false ? (
                          <>
                            <IconMinusCircle />
                            No
                          </>
                        ) : (
                          row.traditional
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="compare-cell is-yes">
                        <IconCheck />
                        {row.fourFg}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="reviews" className="section">
        <div className="container">
          <h2>What people are saying</h2>
          <div className="testimonials-grid">
            {testimonials.map((t) => (
              <blockquote key={t.name} className="card testimonial-card">
                <div className="testimonial-stars" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <IconStar key={i} />
                  ))}
                </div>
                <p className="testimonial-quote">&ldquo;{t.quote}&rdquo;</p>
                <div className="testimonial-author">
                  <div className="testimonial-avatar" aria-hidden="true">{t.name.charAt(0)}</div>
                  <div>
                    <div className="testimonial-name">{t.name}</div>
                    <div className="testimonial-role">{t.role}</div>
                  </div>
                </div>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="section">
        <div className="container">
          <h2>Frequently asked questions</h2>
          <div className="faq-list">
            {faqs.map((item) => (
              <details key={item.q} className="faq-item">
                <summary>
                  <span>{item.q}</span>
                  <IconChevronDown className="faq-icon" />
                </summary>
                <p className="faq-answer">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

    </main>
    <Footer />
    </>
  );
}
