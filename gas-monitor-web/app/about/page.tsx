import type { Metadata } from 'next';
import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import { IconBell, IconChartBar, IconCheck, IconClock, IconSettings, IconWallet, IconMapPin } from '@/components/icons';

export const metadata: Metadata = {
  title: 'About — 4First Technologies',
  description:
    'How 4First Technologies builds the 4FG Monitor: precision embedded sensing hardware, resilient firmware, and a cloud software platform for real-time LPG monitoring.'
};

const embeddedStack = [
  {
    title: 'Precision weight sensing',
    text: 'The base plate uses industrial load cells sampled through a high-resolution analog front end, converting cylinder weight into gas level with kilogram-level accuracy — no probes inside the cylinder, no moving parts.'
  },
  {
    title: 'Low-power firmware',
    text: 'Purpose-built microcontroller firmware manages sensing, filtering, and reporting cycles on a strict power budget, so the device runs for long stretches without babysitting.'
  },
  {
    title: 'Self-contained connectivity',
    text: 'The sensor ships with its own connection to our servers. There is no Wi-Fi setup, no Bluetooth pairing, and nothing to configure — place the cylinder on the plate and readings start flowing.'
  },
  {
    title: 'Signal conditioning on-device',
    text: 'Raw load-cell readings are noisy: temperature drift, cylinder swaps, and vibration all show up in the data. On-board filtering separates real consumption from noise before a reading ever leaves the device.'
  },
  {
    title: 'Fail-safe by design',
    text: 'If connectivity drops, the device buffers readings locally and back-fills them when the link recovers, so your usage history never has silent gaps.'
  },
  {
    title: 'Field-updatable',
    text: 'Devices receive firmware updates remotely, which means every sensor in the field keeps improving after it leaves the factory.'
  }
];

const softwareStack = [
  {
    icon: IconChartBar,
    title: 'Real-time telemetry pipeline',
    text: 'Readings stream from devices into our cloud platform, are validated and normalised, and land on your dashboard in seconds — the number you see is the cylinder as it is right now.'
  },
  {
    icon: IconClock,
    title: 'AI refill prediction',
    text: 'A consumption model learns each household or business’s actual usage rhythm and forecasts the empty date from real trends, not a fixed schedule. Every new home makes the model sharper.'
  },
  {
    icon: IconBell,
    title: 'Alerting engine',
    text: 'Threshold and prediction-based alerts go out over push and email with enough lead time to act, tuned so you are warned early without being spammed.'
  },
  {
    icon: IconMapPin,
    title: 'Vendor marketplace',
    text: 'Location-aware software matches you with verified nearby suppliers, tracks ratings after every order, and keeps the whole refill flow inside one app.'
  },
  {
    icon: IconWallet,
    title: 'Secure payments',
    text: 'Checkout runs through Paystack, a PCI-DSS compliant processor. Card details never touch our servers.'
  },
  {
    icon: IconSettings,
    title: 'One account, every screen',
    text: 'Consumer and vendor roles share a single secure authentication system across the mobile app and this web portal, with the same live data everywhere.'
  }
];

const pipeline = [
  {
    title: 'Sense',
    text: 'Load cells in the base plate weigh the cylinder continuously and firmware converts weight into gas level on the device.'
  },
  {
    title: 'Transmit',
    text: 'Cleaned readings travel over the sensor’s own secure connection to our cloud — no home network required.'
  },
  {
    title: 'Analyse',
    text: 'The platform validates each reading, updates your usage history, and re-runs the refill forecast for your cylinder.'
  },
  {
    title: 'Act',
    text: 'Dashboards update, alerts fire when thresholds approach, and the marketplace is one tap away when it’s time to reorder.'
  }
];

const principles = [
  'Hardware you never have to think about — no pairing, no charging anxiety, no maintenance rituals',
  'Data accuracy over dashboards that merely look busy — every number traces back to a calibrated measurement',
  'Offline resilience at every layer, because power and connectivity in our markets are not a given',
  'Security as a default: encrypted transport, PCI-DSS compliant payments, role-based access',
  'Software that improves with use — predictions, vendor matching, and firmware all get better in the field'
];

export default function AboutPage() {
  return (
    <>
      <main>
        <SiteNav
          variant="solid"
          brandHref="/"
          links={[
            { href: '/', label: 'Home' },
            { href: '/about', label: 'About', active: true },
            { href: '/marketplace', label: 'Marketplace' },
            { href: '/downloads', label: 'Download' },
            { href: '/contact', label: 'Contact' },
            { href: '/partner', label: 'Partner with us' }
          ]}
        />

        <section className="section marketplace-intro">
          <div className="container">
            <span className="badge">About us</span>
            <h1 className="marketplace-title">Smarter Tech, Safer World.</h1>
            <p className="marketplace-sub">
              4First Technologies is an embedded systems and software company. We build the 4FG Monitor — a
              precision sensing platform and cloud software stack that turns an ordinary LPG cylinder into a
              connected, predictable part of your home or business.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <h2>Why we exist</h2>
            <p className="section-sub">
              Across Nigeria and West Africa, millions of homes and businesses run on LPG with no idea how much gas
              is left. The result is burnt-out dinners, closed kitchens, and emergency refills at the worst possible
              price. We believe the fix is not a better gauge — it&apos;s better engineering: accurate sensing at the
              cylinder, intelligent software in the cloud, and a trusted supply chain in between.
            </p>
            <p className="section-sub">
              Everything we ship is designed and tested for the realities of our markets: intermittent power,
              variable connectivity, and users who need technology that simply works without a manual.
            </p>
          </div>
        </section>

        <section id="embedded" className="section about-band">
          <div className="container">
            <h2>The embedded system</h2>
            <p className="section-sub">
              The 4FG Monitor starts as a hardware problem: how do you measure gas in a sealed steel cylinder,
              reliably, for years, with zero setup? Our answer lives in the base plate.
            </p>
            <div className="grid-3">
              {embeddedStack.map((item) => (
                <div key={item.title} className="card">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="software" className="section">
          <div className="container">
            <h2>The software platform</h2>
            <p className="section-sub">
              A sensor is only as useful as the software behind it. Our cloud platform, mobile app, and this web
              portal turn raw telemetry into decisions you can act on.
            </p>
            <div className="grid-3">
              {softwareStack.map((item) => (
                <div key={item.title} className="card">
                  <div className="partner-card-icon" aria-hidden="true">
                    <item.icon />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pipeline" className="section about-band">
          <div className="container">
            <h2>From sensor to screen</h2>
            <p className="section-sub">Four stages, a few seconds, end to end.</p>
            <div className="steps-grid" role="list">
              {pipeline.map((step, index) => (
                <div key={step.title} className="step-card" role="listitem">
                  <div className="step-number" aria-hidden="true">{index + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="principles" className="section">
          <div className="container">
            <h2>How we engineer</h2>
            <p className="section-sub">The principles behind every hardware revision and software release.</p>
            <ul className="simple-list about-principles">
              {principles.map((item) => (
                <li key={item}>
                  <IconCheck />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="card partner-card">
              <div>
                <h2>See the technology in action</h2>
                <p className="section-sub">
                  Get a sensor for your home or business, or explore the marketplace of verified vendors it connects
                  you to.
                </p>
                <div className="hero-actions">
                  <a href="/downloads" className="btn btn-primary">Get the 4FG Monitor</a>
                  <a href="/marketplace" className="btn btn-secondary">Browse the marketplace</a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
