'use client';

import { Suspense } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { companiesModule } from '@/admin/modules/companies';
import { LoadingState } from '@/admin/primitives/states';

export default function CompaniesPage() {
  // useSearchParams (inside useResource) requires a Suspense boundary.
  return (
    <Suspense fallback={<LoadingState />}>
      <ResourceList config={companiesModule} />
    </Suspense>
  );
}
