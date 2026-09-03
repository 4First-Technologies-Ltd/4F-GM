'use client';

import { Suspense } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { vendorsModule } from '@/admin/modules/vendors';
import { LoadingState } from '@/admin/primitives/states';

export default function VendorsPage() {
  // useSearchParams (inside useResource) requires a Suspense boundary in the
  // App Router, or the whole route opts out of static rendering.
  return (
    <Suspense fallback={<LoadingState />}>
      <ResourceList config={vendorsModule} />
    </Suspense>
  );
}
