interface PendingCompanyProfile {
  companyName: string;
  address: string;
  phone: string;
  state?: string;
  city?: string;
}

let pending: PendingCompanyProfile | null = null;

/** Held in memory only until the email is verified (a profile needs a session). */
export function setPendingCompanyProfile(profile: PendingCompanyProfile) {
  pending = profile;
}

export function takePendingCompanyProfile(): PendingCompanyProfile | null {
  const current = pending;
  pending = null;
  return current;
}
