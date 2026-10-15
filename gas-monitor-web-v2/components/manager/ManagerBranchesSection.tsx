'use client';

import { useEffect, useState } from 'react';
import { staffApi, type StaffBranch } from '@/lib/api';

/** Read-only list of the branches a manager runs, on the profile page. */
export function ManagerBranchesSection() {
  const [branches, setBranches] = useState<StaffBranch[] | null>(null);

  useEffect(() => {
    staffApi
      .me()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  if (branches === null) return null;

  return (
    <div className="mt-6 rounded-2xl bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-foreground mb-4">Your branches</h3>
      {branches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No branch assigned yet.</p>
      ) : (
        <ul className="space-y-3">
          {branches.map((b) => (
            <li key={b.id} className="text-sm">
              <p className="font-medium text-foreground">{b.name}</p>
              <p className="text-muted-foreground">{b.vendor.businessName}</p>
              <p className="text-muted-foreground">{b.address}</p>
              {(!b.isActive || !!b.suspendedAt) && (
                <p className="text-destructive">{b.suspendedAt ? 'Suspended by 4FG' : 'Closed by the owner'}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
