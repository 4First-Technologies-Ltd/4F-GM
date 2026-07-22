import type { Metadata } from 'next';
import { Ubuntu } from 'next/font/google';
import './globals.css';

const ubuntu = Ubuntu({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-body'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://4fgmpanel.4fgmonitor.com'),
  title: '4FG Admin',
  description: 'Admin panel for the 4FG Gas Monitor platform',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ubuntu.variable}>
      <body>{children}</body>
    </html>
  );
}
