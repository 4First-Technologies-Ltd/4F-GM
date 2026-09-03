'use client';

import { Suspense } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { customersModule } from '@/admin/modules/customers';
import { LoadingState } from '@/admin/primitives/states';

export default function CustomersPage() {
  // useSearchParams (inside useResource) requires a Suspense boundary in the
  // App Router, or the whole route opts out of static rendering.
  return (
    <Suspense fallback={<LoadingState />}>
      <ResourceList config={customersModule} />
    </Suspense>
  );
}
