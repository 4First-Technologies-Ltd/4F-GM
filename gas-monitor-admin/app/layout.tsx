import { Ubuntu } from 'next/font/google';
import './globals.css';

const ubuntu = Ubuntu({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-body'
});

export const metadata = {
  title: '4FG Admin',
  description: 'Admin panel for the 4FG Gas Monitor platform'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ubuntu.variable}>
      <body>{children}</body>
    </html>
  );
}
