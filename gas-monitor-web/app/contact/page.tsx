'use client';

import { FormEvent, useState } from 'react';
import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import { IconMail, IconPhone, IconMapPin, IconClock } from '@/components/icons';
import { API_BASE_URL } from '@/lib/api';

const CHANNELS = [
  {
    icon: IconMail,
    title: 'Email us',
    detail: '4firsttechnologieslimited@gmail.com',
    sub: 'We reply within one business day.',
    href: 'mailto:4firsttechnologieslimited@gmail.com'
  },
  {
    icon: IconPhone,
    title: 'Call or WhatsApp',
    detail: '+234 800 000 0000',
    sub: 'Mon – Sat, 8am – 6pm WAT.',
    href: 'tel:+2348000000000'
  },
  {
    icon: IconMapPin,
    title: 'Visit us',
    detail: 'Lagos, Nigeria',
    sub: '4First Technologies Ltd.',
    href: undefined
  },
  {
    icon: IconClock,
    title: 'Support hours',
    detail: 'Mon – Sat, 8am – 6pm',
    sub: 'Urgent delivery issues get priority.',
    href: undefined
  }
];

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('support');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? 'Could not send your message. Please try again.');
      }
      setSent(true);
      setName('');
      setEmail('');
      setTopic('support');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <main>
        <SiteNav
          variant="solid"
          brandHref="/"
          links={[
            { href: '/', label: 'Home' },
            { href: '/marketplace', label: 'Marketplace' },
            { href: '/downloads', label: 'Download' },
            { href: '/contact', label: 'Contact', active: true },
            { href: '/partner', label: 'Partner with us' }
          ]}
        />

        <section className="section marketplace-intro">
          <div className="container">
            <span className="badge">Contact</span>
            <h1 className="marketplace-title">Talk to the 4FG team</h1>
            <p className="marketplace-sub">
              Questions about the sensor, your order, or partnering with us? Reach out through any channel below or
              send us a message — we&apos;ll get back to you quickly.
            </p>
          </div>
        </section>

        <section className="section contact-section">
          <div className="container contact-grid">
            <div className="contact-channels">
              {CHANNELS.map((channel) => {
                const Icon = channel.icon;
                const body = (
                  <>
                    <span className="partner-card-icon contact-channel-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <div>
                      <h3>{channel.title}</h3>
                      <p className="contact-channel-detail">{channel.detail}</p>
                      <p className="contact-channel-sub">{channel.sub}</p>
                    </div>
                  </>
                );
                return channel.href ? (
                  <a key={channel.title} href={channel.href} className="card contact-channel">
                    {body}
                  </a>
                ) : (
                  <div key={channel.title} className="card contact-channel">
                    {body}
                  </div>
                );
              })}
            </div>

            <div className="card contact-form-card">
              <h2>Send us a message</h2>
              <p className="hero-card-sub">Fill in the form and we&apos;ll reply to your email.</p>

              {sent && (
                <p className="form-success" role="status">
                  Message sent — thanks for reaching out. We&apos;ll get back to you shortly.
                </p>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="contact-name">Full name</label>
                    <input
                      id="contact-name"
                      required
                      minLength={2}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="contact-email">Email address</label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="contact-topic">What is this about?</label>
                  <select id="contact-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                    <option value="support">Product or order support</option>
                    <option value="sales">Buying a sensor</option>
                    <option value="partnership">Partnership / vendor onboarding</option>
                    <option value="other">Something else</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    required
                    minLength={10}
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <span className="field-help">Include your order reference if this is about an existing order.</span>
                </div>

                <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
