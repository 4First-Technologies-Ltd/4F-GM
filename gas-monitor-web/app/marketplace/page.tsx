import NavAuthActions from '@/components/NavAuthActions';
import Footer from '@/components/Footer';

type GasType = 'cooking' | 'medical' | 'industrial' | 'bulk';

interface Vendor {
  id: string;
  name: string;
  initials: string;
  color: string;
  types: GasType[];
  address: string;
  sizes: string[];
  isOpen: boolean;
  hours: string;
  rating: number;
}

const TYPE_LABEL: Record<GasType, string> = {
  cooking: 'Cooking Gas',
  medical: 'Medical O₂',
  industrial: 'Industrial',
  bulk: 'Bulk LPG'
};

// Same vendor directory as the mobile app's order flow (app/order/(tabs)/index.tsx),
// kept in sync so both platforms show the same suppliers.
const VENDORS: Vendor[] = [
  {
    id: '1',
    name: 'Ardova Gas Ltd',
    initials: 'AG',
    color: '#2D7450',
    types: ['cooking'],
    address: '14 Admiralty Way, Lekki Phase 1',
    sizes: ['6 kg', '12.5 kg', '50 kg'],
    isOpen: true,
    hours: '7am – 9pm',
    rating: 4.8
  },
  {
    id: '2',
    name: 'MedGas Nigeria',
    initials: 'MG',
    color: '#1565C0',
    types: ['medical'],
    address: '22 Adeola Odeku St, Victoria Island',
    sizes: ['Medical O₂', 'N₂', 'CO₂'],
    isOpen: true,
    hours: '24 hrs',
    rating: 4.9
  },
  {
    id: '3',
    name: 'Total Gas Depot',
    initials: 'TG',
    color: '#E65100',
    types: ['cooking', 'bulk'],
    address: '5 Kingsway Rd, Ikoyi',
    sizes: ['12.5 kg', '50 kg'],
    isOpen: true,
    hours: '6am – 8pm',
    rating: 4.5
  },
  {
    id: '4',
    name: 'HomeGas Express',
    initials: 'HG',
    color: '#2D7450',
    types: ['cooking'],
    address: '18 Bode Thomas St, Surulere',
    sizes: ['6 kg', '12.5 kg'],
    isOpen: true,
    hours: '8am – 7pm',
    rating: 4.3
  },
  {
    id: '5',
    name: 'ProMed Gases',
    initials: 'PM',
    color: '#1565C0',
    types: ['medical', 'industrial'],
    address: '3 Broad St, Lagos Marina',
    sizes: ['Medical O₂', 'Argon', 'CO₂', 'N₂'],
    isOpen: true,
    hours: '8am – 6pm',
    rating: 4.7
  },
  {
    id: '6',
    name: 'Industrial Gas Co.',
    initials: 'IG',
    color: '#E65100',
    types: ['industrial', 'bulk'],
    address: '11 Creek Rd, Apapa',
    sizes: ['50 kg', '100 kg', 'Bulk Tank'],
    isOpen: false,
    hours: 'Opens 6am',
    rating: 4.6
  }
];

export default function MarketplacePage() {
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
            <a href="/marketplace" className="active">Marketplace</a>
            <a href="/downloads">Download</a>
            <a href="/#contact">Contact</a>
          </div>
          <NavAuthActions />
        </div>
      </header>

      <section className="section marketplace-intro">
        <div className="container">
          <span className="badge">Vendor marketplace</span>
          <h1 className="marketplace-title">Find a trusted gas supplier near you</h1>
          <p className="marketplace-sub">
            Compare verified vendors by gas type, cylinder size, and rating, then order refills straight from your
            dashboard.
          </p>
        </div>
      </section>

      <section className="section marketplace-section">
        <div className="container">
          <div className="marketplace-grid">
            {VENDORS.map((vendor) => (
              <div key={vendor.id} className="card vendor-card">
                <div className="vendor-card-head">
                  <span className="vendor-avatar" style={{ background: vendor.color }} aria-hidden="true">
                    {vendor.initials}
                  </span>
                  <div className="vendor-card-heading">
                    <h3>{vendor.name}</h3>
                    <span className="vendor-rating">★ {vendor.rating.toFixed(1)}</span>
                  </div>
                </div>

                <p className="vendor-address">{vendor.address}</p>

                <div className="vendor-type-pills">
                  {vendor.types.map((type) => (
                    <span key={type} className="pill">
                      {TYPE_LABEL[type]}
                    </span>
                  ))}
                </div>

                <p className="vendor-sizes">{vendor.sizes.join(' · ')}</p>

                <div className="vendor-card-foot">
                  <span className={`status-pill ${vendor.isOpen ? 'status-confirmed' : 'status-cancelled'}`}>
                    {vendor.isOpen ? 'Open now' : vendor.hours}
                  </span>
                  <a
                    href={`/dashboard/orders?supplier=${encodeURIComponent(vendor.name)}`}
                    className="btn btn-primary btn-sm"
                  >
                    Order now
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
    <Footer />
    </>
  );
}
