'use client';

import { useState } from 'react';
import NavAuthActions from './NavAuthActions';
import { IconClose, IconMenu } from './icons';

type NavLink = { href: string; label: string; active?: boolean };

export default function SiteNav({
  variant,
  brandHref,
  links
}: {
  variant: 'transparent' | 'solid';
  brandHref: string;
  links: NavLink[];
}) {
  const [open, setOpen] = useState(false);
  const Wrapper = variant === 'transparent' ? 'nav' : 'header';
  const wrapperClass = variant === 'transparent' ? 'navbar' : 'site-header';

  return (
    <Wrapper className={wrapperClass}>
      <div className="container navbar-row">
        <a className="brand" href={brandHref}>
          <span className="brand-mark">4F</span>
          <span>4FG Smart Gas Monitor</span>
        </a>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <IconClose /> : <IconMenu />}
        </button>

        <div className={`nav-links${open ? ' is-open' : ''}`}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={link.active ? 'active' : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="nav-links-mobile-auth">
            <NavAuthActions />
          </div>
        </div>

        <div className="nav-auth-desktop">
          <NavAuthActions />
        </div>
      </div>
    </Wrapper>
  );
}
