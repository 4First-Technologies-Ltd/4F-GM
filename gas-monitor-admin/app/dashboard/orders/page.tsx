'use client';

import { Suspense } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { ordersModule } from '@/admin/modules/orders';
import { LoadingState } from '@/admin/primitives/states';

export default function OrdersPage() {
  // useSearchParams (inside useResource) requires a Suspense boundary in the
  // App Router, or the whole route opts out of static rendering.
  return (
    <Suspense fallback={<LoadingState />}>
      <ResourceList config={ordersModule} />
    </Suspense>
  );
}
