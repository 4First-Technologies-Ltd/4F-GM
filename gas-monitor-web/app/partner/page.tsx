import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import { IconCheck, IconPackage, IconStore } from '@/components/icons';

const distributorBenefits = [
  'Stock and supply 4FG smart sensors in your region',
  'Volume pricing with dedicated onboarding support',
  'Access to demand insights from the app to guide restocking',
  'Co-branded marketing materials for your territory'
];

const gasStationBenefits = [
  'Get listed as a verified vendor in the marketplace',
  'Receive orders directly from nearby monitored households',
  'Ratings and reviews that build trust with new customers',
  'No listing fees — pay only per completed order'
];

export default function PartnerPage() {
  return (
    <>
      <main>
        <SiteNav
          variant="solid"
          brandHref="/"
          links={[
            { href: '/', label: 'Home' },
            { href: '/about', label: 'About' },
            { href: '/marketplace', label: 'Marketplace' },
            { href: '/downloads', label: 'Download' },
            { href: '/contact', label: 'Contact' },
            { href: '/partner', label: 'Partner with us', active: true }
          ]}
        />

        <section className="section marketplace-intro">
          <div className="container">
            <span className="badge">Partnerships</span>
            <h1 className="marketplace-title">Grow with 4FG Monitor</h1>
            <p className="marketplace-sub">
              We&apos;re building a nationwide network of distributors and gas stations to bring real-time cylinder
              monitoring to every home and business. Here&apos;s how to partner with us.
            </p>
          </div>
        </section>

        <section id="distributor" className="section">
          <div className="container">
            <div className="card partner-card">
              <div className="partner-card-icon" aria-hidden="true">
                <IconPackage />
              </div>
              <div>
                <h2>Partner as a distributor</h2>
                <p className="section-sub">
                  Bring 4FG sensors to your region and help households and businesses get set up with real-time gas
                  monitoring.
                </p>
                <ul className="simple-list">
                  {distributorBenefits.map((item) => (
                    <li key={item}>
                      <IconCheck />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:4firsttechnologieslimited@gmail.com?subject=Distributor%20Partnership%20Application"
                  className="btn btn-primary"
                >
                  Apply as a distributor
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="gas-station" className="section">
          <div className="container">
            <div className="card partner-card">
              <div className="partner-card-icon" aria-hidden="true">
                <IconStore />
              </div>
              <div>
                <h2>Partner with us as a gas station</h2>
                <p className="section-sub">
                  Join our verified vendor marketplace and start receiving orders from customers monitoring their
                  cylinders in real time.
                </p>
                <ul className="simple-list">
                  {gasStationBenefits.map((item) => (
                    <li key={item}>
                      <IconCheck />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:4firsttechnologieslimited@gmail.com?subject=Gas%20Station%20Partnership%20Application"
                  className="btn btn-primary"
                >
                  Apply as a gas station
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
