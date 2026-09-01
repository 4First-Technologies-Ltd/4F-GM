import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://4fgmonitor.com'),
  title: '4FG Smart Gas Monitor — Inside the Device',
  description:
    'An interactive, scroll-driven look inside the 4FG Smart Gas Monitor: ESP32, GSM module, load-cell weight sensors, and power system.',
  openGraph: {
    title: '4FG Smart Gas Monitor — Inside the Device',
    description:
      'An interactive, scroll-driven look inside the 4FG Smart Gas Monitor: ESP32, GSM module, load-cell weight sensors, and power system.',
    url: 'https://4fgmonitor.com',
    siteName: '4FG Smart Gas Monitor'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
