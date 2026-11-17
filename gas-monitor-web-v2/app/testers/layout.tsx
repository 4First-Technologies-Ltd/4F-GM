import type { Metadata } from 'next';

// A private working tool for invited testers: keep it out of search results.
export const metadata: Metadata = {
  title: 'Bug tracker',
  robots: { index: false, follow: false }
};

export default function TestersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
