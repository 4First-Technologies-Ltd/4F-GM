export default function Footer() {
  return (
    <footer className="site-footer" id="contact">
      <div className="container footer-inner">
        <div className="footer-brand-col">
          <a className="brand" href="/">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>
          <p className="footer-tagline">
            Real-time gas monitoring, AI-powered refill predictions, and a trusted vendor marketplace — all in one
            place.
          </p>
        </div>

        <div className="footer-col">
          <h4>Product</h4>
          <a href="/#features">Features</a>
          <a href="/#faq">FAQ</a>
          <a href="/marketplace">Marketplace</a>
          <a href="/downloads">Download</a>
        </div>

        <div className="footer-col">
          <h4>Account</h4>
          <a href="/sign-in">Sign in</a>
          <a href="/sign-up">Create account</a>
          <a href="/dashboard">Dashboard</a>
        </div>

        <div className="footer-col">
          <h4>Contact</h4>
          <a href="mailto:4firsttechnologieslimited@gmail.com">4firsttechnologieslimited@gmail.com</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
        </div>
      </div>

      <div className="container footer-bottom">
        <p>&copy; 2026 4First Technologies Ltd. All rights reserved.</p>
      </div>
    </footer>
  );
}
