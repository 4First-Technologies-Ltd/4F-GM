import ProductHero from '@/components/ui/ProductHero';

export default function HomePage() {
  return (
    <main>
      <header className="page-header">
        <p className="brand">4FG</p>
        <h1>See exactly what&apos;s inside your gas monitor.</h1>
        <p className="lede">
          Scroll to take the 4FG Smart Gas Monitor apart, piece by piece — in real time, in your browser.
        </p>
      </header>

      <ProductHero />

      <section className="specs">
        <h2>What&apos;s inside</h2>
        <div className="specs-grid">
          <article>
            <h3>ESP32 Module</h3>
            <p>Local processing, Wi-Fi fallback, and the brain that ties every sensor reading together.</p>
          </article>
          <article>
            <h3>GSM Module &amp; Antenna</h3>
            <p>Cellular connectivity means no home Wi-Fi is required — readings reach the cloud anywhere there&apos;s signal.</p>
          </article>
          <article>
            <h3>Load Cells &amp; HX711 Amplifier</h3>
            <p>Four precision load cells measure cylinder weight directly; the amplifier turns that into an accurate percentage.</p>
          </article>
          <article>
            <h3>Power Management &amp; Battery</h3>
            <p>A dedicated regulator and battery keep the device reporting through short power outages.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
