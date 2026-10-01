interface PendingRiderProfile {
  phone: string;
  vehicleType?: string;
  plateNumber?: string;
}

let pending: PendingRiderProfile | null = null;

export function setPendingRiderProfile(profile: PendingRiderProfile) {
  pending = profile;
}

export function takePendingRiderProfile(): PendingRiderProfile | null {
  const current = pending;
  pending = null;
  return current;
}
