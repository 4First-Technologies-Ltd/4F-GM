interface PendingVendorProfile {
  businessName: string;
  businessAddress: string;
  phone: string;
  lat?: number;
  lng?: number;
  documents: { uri: string; fileName: string }[];
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
