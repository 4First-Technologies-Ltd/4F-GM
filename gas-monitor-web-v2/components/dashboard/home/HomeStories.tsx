'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentType } from 'react';
import { Lightbulb, ShieldCheck, Star, Store, Tag } from 'lucide-react';
import type { PublicListing } from '@/lib/marketplace';
import { formatNaira } from '@/lib/format';
import {
  SAFETY_TIPS,
  SAVING_TIPS,
  dealsOf,
  loadSeen,
  newestOf,
  saveSeen,
  storySignature,
  type StoryId
} from '@/lib/home-content';
import { Sheet } from './Sheet';

const STORIES: { id: StoryId; label: string; icon: ComponentType<{ className?: string }>; title: string }[] = [
  { id: 'deals', label: 'Deals', icon: Tag, title: 'Best prices right now' },
  { id: 'safety', label: 'Safety', icon: ShieldCheck, title: 'Gas safety' },
  { id: 'tips', label: 'Tips', icon: Lightbulb, title: 'Make your gas last' },
  { id: 'rewards', label: 'Rewards', icon: Star, title: 'Rewards' },
  { id: 'new', label: 'New', icon: Store, title: 'New on the marketplace' }
];

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * The row of circular cards under the greeting. A ring marks a card with something you have not
 * seen yet; it returns when the card's content changes (new prices, new suppliers).
 */
export function HomeStories({ listings }: { listings: PublicListing[] | null }) {
  const [open, setOpen] = useState<StoryId | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});

  useEffect(() => {
    setSeen(loadSeen());
  }, []);

  const unseen = (id: StoryId) => seen[id] !== storySignature(id, listings);

  function openStory(id: StoryId) {
    setOpen(id);
    const next = { ...seen, [id]: storySignature(id, listings) };
    setSeen(next);
    saveSeen(next);
  }

  const story = STORIES.find((x) => x.id === open) ?? null;

  return (
    <>
      <ul className="flex gap-3.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STORIES.map((st) => {
          const fresh = unseen(st.id);
          const Icon = st.icon;
          return (
            <li key={st.id} className="flex-none">
              <button
                type="button"
                onClick={() => openStory(st.id)}
                aria-label={`${st.label}${fresh ? ', new' : ''}`}
                className={`flex w-[60px] flex-col items-center gap-1.5 rounded-xl ${FOCUS}`}
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-2 bg-card ${
                    fresh ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className={`text-[11px] font-semibold ${fresh ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {st.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {story && (
        <Sheet title={story.title} onClose={() => setOpen(null)}>
          <div className="max-h-[60dvh] overflow-y-auto">
            {open === 'deals' && (
              <Listings
                items={dealsOf(listings ?? [])}
                empty="No deals right now. Check back soon."
                note={(l) => `${formatNaira(l.pricePerKg)} / kg`}
                onGo={() => setOpen(null)}
              />
            )}
            {open === 'new' && (
              <Listings
                items={newestOf(listings ?? [])}
                empty="Nothing new this month."
                note={(l) =>
                  `${formatNaira(l.pricePerKg)} / kg · added ${new Date(l.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                }
                onGo={() => setOpen(null)}
              />
            )}
            {open === 'safety' && <TipList tips={SAFETY_TIPS} />}
            {open === 'tips' && <TipList tips={SAVING_TIPS} />}
            {open === 'rewards' && (
              <div className="flex flex-col items-center gap-2 py-5 text-center">
                <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Star className="h-7 w-7" />
                </span>
                <p className="text-base font-extrabold text-foreground">Rewards are coming soon</p>
                <p className="max-w-[280px] text-[13px] leading-snug text-muted-foreground">
                  We are building rewards for regular customers. There is nothing to claim yet.
                </p>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

function Listings({
  items,
  empty,
  note,
  onGo
}: {
  items: PublicListing[];
  empty: string;
  note: (l: PublicListing) => string;
  onGo: () => void;
}) {
  if (items.length === 0) return <p className="my-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((l) => (
        <li key={l.id} className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">{l.vendor.businessName}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{note(l)}</span>
          </span>
          <Link
            href={`/marketplace/${l.id}`}
            onClick={onGo}
            className={`rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground ${FOCUS}`}
          >
            Order
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TipList({ tips }: { tips: { title: string; body: string }[] }) {
  return (
    <ul className="space-y-3">
      {tips.map((t) => (
        <li key={t.title} className="rounded-2xl border border-border bg-muted/30 p-3.5">
          <p className="text-sm font-bold text-foreground">{t.title}</p>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{t.body}</p>
        </li>
      ))}
    </ul>
  );
}
