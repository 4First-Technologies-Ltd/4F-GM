import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { MarketplaceListing } from '@/lib/api';
import {
  SAFETY_TIPS,
  SAVING_TIPS,
  dealsOf,
  loadSeen,
  newestOf,
  saveSeen,
  storySignature,
  type StoryId,
} from '@/lib/homeContent';

const C = {
  card: '#FFFFFF',
  surface: '#F5FBF5',
  border: '#E0EEE0',
  text: '#1A2E1A',
  muted: '#7A9A7A',
  dim: '#AECAAE',
  accent: '#2D7450',
  accentLight: '#E8F5E8',
};

type IconName = React.ComponentProps<typeof IconSymbol>['name'];

const STORIES: { id: StoryId; label: string; icon: IconName; title: string }[] = [
  { id: 'deals', label: 'Deals', icon: 'tag.fill', title: 'Best prices right now' },
  { id: 'safety', label: 'Safety', icon: 'shield.fill', title: 'Gas safety' },
  { id: 'tips', label: 'Tips', icon: 'lightbulb.fill', title: 'Make your gas last' },
  { id: 'rewards', label: 'Rewards', icon: 'star.fill', title: 'Rewards' },
  { id: 'new', label: 'New', icon: 'storefront.fill', title: 'New on the marketplace' },
];

const naira = (n: number) => `₦${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/**
 * The row of circular cards under the greeting. A ring marks a card with something you have not
 * seen yet; it returns when the card's content changes (new prices, new suppliers).
 */
export function HomeStories({
  listings,
  onOrder,
}: {
  listings: MarketplaceListing[] | null;
  /** Opens the order form for a listing from Deals or New. */
  onOrder: (listingId: string) => void;
}) {
  const [open, setOpen] = useState<StoryId | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    loadSeen().then((s) => { if (live) setSeen(s); });
    return () => { live = false; };
  }, []);

  const unseen = (id: StoryId) => seen[id] !== storySignature(id, listings);

  function openStory(id: StoryId) {
    setOpen(id);
    const next = { ...seen, [id]: storySignature(id, listings) };
    setSeen(next);
    void saveSeen(next);
  }

  const story = STORIES.find((x) => x.id === open) ?? null;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {STORIES.map((st) => {
          const fresh = unseen(st.id);
          return (
            <TouchableOpacity
              key={st.id}
              style={s.item}
              onPress={() => openStory(st.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${st.label}${fresh ? ', new' : ''}`}
            >
              <View style={[s.circle, { borderColor: fresh ? C.accent : C.border }]}>
                <IconSymbol name={st.icon} size={22} color={fresh ? C.accent : C.muted} />
              </View>
              <Text style={[s.label, !fresh && { color: C.muted }]}>{st.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={story != null} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <Pressable style={s.overlay} onPress={() => setOpen(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>{story?.title}</Text>
            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              {open === 'deals' && (
                <Listings
                  items={dealsOf(listings ?? [])}
                  empty="No deals right now. Check back soon."
                  note={(l) => `${naira(l.pricePerKg)} / kg`}
                  onOrder={(id) => { setOpen(null); onOrder(id); }}
                />
              )}
              {open === 'new' && (
                <Listings
                  items={newestOf(listings ?? [])}
                  empty="Nothing new this month."
                  note={(l) => `${naira(l.pricePerKg)} / kg · added ${new Date(l.createdAt as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                  onOrder={(id) => { setOpen(null); onOrder(id); }}
                />
              )}
              {open === 'safety' && <TipList tips={SAFETY_TIPS} />}
              {open === 'tips' && <TipList tips={SAVING_TIPS} />}
              {open === 'rewards' && (
                <View style={s.rewards}>
                  <View style={s.rewardsIcon}><IconSymbol name="star.fill" size={28} color={C.accent} /></View>
                  <Text style={s.rewardsTitle}>Rewards are coming soon</Text>
                  <Text style={s.rewardsBody}>
                    We are building rewards for regular customers. There is nothing to claim yet.
                  </Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Listings({
  items,
  empty,
  note,
  onOrder,
}: {
  items: MarketplaceListing[];
  empty: string;
  note: (l: MarketplaceListing) => string;
  onOrder: (id: string) => void;
}) {
  if (items.length === 0) return <Text style={s.empty}>{empty}</Text>;
  return (
    <View style={{ gap: 10 }}>
      {items.map((l) => (
        <View key={l.id} style={s.listing}>
          <View style={{ flex: 1 }}>
            <Text style={s.listingName} numberOfLines={1}>{l.vendor.businessName}</Text>
            <Text style={s.listingNote}>{note(l)}</Text>
          </View>
          <TouchableOpacity style={s.orderBtn} onPress={() => onOrder(l.id)} activeOpacity={0.85}>
            <Text style={s.orderBtnText}>Order</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function TipList({ tips }: { tips: { title: string; body: string }[] }) {
  return (
    <View style={{ gap: 12 }}>
      {tips.map((t) => (
        <View key={t.title} style={s.tip}>
          <Text style={s.tipTitle}>{t.title}</Text>
          <Text style={s.tipBody}>{t.body}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { gap: 14, paddingHorizontal: 16, paddingVertical: 2 },
  item: { alignItems: 'center', gap: 5, width: 60 },
  circle: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { color: C.text, fontSize: 11, fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },

  listing: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12,
  },
  listingName: { color: C.text, fontSize: 14, fontWeight: '700' },
  listingNote: { color: C.muted, fontSize: 12, marginTop: 2 },
  orderBtn: { backgroundColor: C.accent, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 9 },
  orderBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { color: C.muted, fontSize: 14, textAlign: 'center', marginVertical: 24 },

  tip: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 4 },
  tipTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  tipBody: { color: '#3D6B3D', fontSize: 13, lineHeight: 19 },

  rewards: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  rewardsIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: C.accentLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  rewardsTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  rewardsBody: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
});
