import type { BranchInput } from '@/lib/api';

interface PendingVendorProfile {
  businessName: string;
  businessAddress: string;
  phone: string;
  rcNumber: string;
  lat?: number;
  lng?: number;
  branches?: BranchInput[];
}

let pending: PendingVendorProfile | null = null;

export function setPendingVendorProfile(profile: PendingVendorProfile) {
  pending = profile;
}

export function takePendingVendorProfile(): PendingVendorProfile | null {
  const current = pending;
  pending = null;
  return current;
}
