import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useApprovalStatus, useVendorRcMissing } from '@/hooks/use-approval-status';

type Kind = 'vendor' | 'rider' | 'company';

const COPY: Record<Kind, { title: string; body: string }> = {
  vendor: {
    title: 'Your store is awaiting approval',
    body: 'Customers can’t see your store or order from you yet. Set up your listings and branches now — everything goes live as soon as you’re approved.',
  },
  rider: {
    title: 'Your rider account is awaiting approval',
    body: 'You can look around, but you won’t be assigned deliveries until you’re approved.',
  },
  company: {
    title: 'Your company is awaiting approval',
    body: 'Your riders can’t take deliveries and you can’t invite riders until you’re approved.',
  },
};

/** Shown on a vendor/rider/company dashboard while their account is PENDING approval. */
export function ApprovalBanner({ kind }: { kind: Kind }) {
  const status = useApprovalStatus();
  const rcMissing = useVendorRcMissing();
  if (status !== 'PENDING') return null;
  const { title, body } = COPY[kind];

  return (
    <View style={s.box} accessibilityRole="alert">
      <IconSymbol name="hourglass" size={20} color={AMBER} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.body}>{body}</Text>
        {kind === 'vendor' && rcMissing && (
          <TouchableOpacity onPress={() => router.push('/(vendor)/profile')} activeOpacity={0.7}>
            <Text style={s.link}>Complete your profile to get approved</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const AMBER = '#B45309';

const s = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  title: { color: AMBER, fontSize: 14, fontWeight: '800' },
  body: { color: '#78350F', fontSize: 13, lineHeight: 18, marginTop: 2 },
  link: { color: AMBER, fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 6, textDecorationLine: 'underline' },
});
