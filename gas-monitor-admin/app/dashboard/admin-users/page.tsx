'use client';

import { Suspense } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { adminUsersModule } from '@/admin/modules/admin-users';
import { LoadingState } from '@/admin/primitives/states';

export default function AdminUsersPage() {
  // useSearchParams (inside useResource) requires a Suspense boundary in the
  // App Router, or the whole route opts out of static rendering.
  return (
    <Suspense fallback={<LoadingState />}>
      <ResourceList config={adminUsersModule} />
    </Suspense>
  );
}
