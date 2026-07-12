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
  title: '4First Technologies - Smarter Tech, Safer World.',
  description: 'Smarter Tech, Safer World. Real-time gas monitoring, AI-powered refill predictions, and a trusted vendor marketplace.',
  openGraph: {
    title: '4First Technologies - Smarter Tech, Safer World.',
    description: 'Smarter Tech, Safer World. Real-time gas monitoring, AI-powered refill predictions, and a trusted vendor marketplace.',
    siteName: '4First Technologies',
    type: 'website'
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
