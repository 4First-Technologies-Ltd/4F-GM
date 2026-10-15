'use client';

import { useEffect, useState } from 'react';
import { companyApi, type CompanyProfile } from '@/lib/api';

/** Read-only company details on the profile page. */
export function CompanyDetailsSection() {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    companyApi
      .getProfile()
      .then(setCompany)
      .catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!company) return null;

  return (
    <div className="mt-6 rounded-2xl bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-foreground mb-4">Company details</h3>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Company</dt>
          <dd className="font-medium text-foreground text-right">{company.companyName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="font-medium text-foreground text-right">{company.phone}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Address</dt>
          <dd className="font-medium text-foreground text-right">
            {[company.address, company.city, company.state].filter(Boolean).join(', ')}
          </dd>
        </div>
      </dl>
    </div>
  );
}
