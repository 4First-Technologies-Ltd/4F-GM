import Link from "next/link";
import { LogoLockup } from "@/components/site/Logo";

const groups = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "How it works" },
      { href: "/marketplace", label: "Marketplace" },
      { href: "/downloads", label: "Mobile app" },
    ],
  },
  {
    title: "Vendors",
    links: [
      { href: "/partner", label: "Become a vendor" },
      { href: "/pricing", label: "Partner plans" },
      { href: "/sign-in", label: "Vendor sign in" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-border bg-background/80 backdrop-blur">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <LogoLockup width={168} className="-ml-1" />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Real-time gas cylinder monitoring, automatic reorder, and a vetted
            vendor marketplace.
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <ul className="mt-4 space-y-2">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-7xl px-6 pb-10 text-xs text-muted-foreground">
        © {new Date().getFullYear()} 4First Technologies Limited. All rights
        reserved.
      </div>
    </footer>
  );
}
