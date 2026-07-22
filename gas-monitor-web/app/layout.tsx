import type { Metadata } from 'next';
import { Ubuntu } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

const ubuntu = Ubuntu({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-body'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://4fgmonitor.com'),
  title: '4FG Smart Gas Monitor',
  description: 'A web portal for monitoring gas usage, managing refill alerts, and connecting with nearby vendors.',
  openGraph: {
    title: '4FG Smart Gas Monitor',
    description: 'A web portal for monitoring gas usage, managing refill alerts, and connecting with nearby vendors.',
    url: 'https://4fgmonitor.com',
    siteName: '4FG Smart Gas Monitor'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ubuntu.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
