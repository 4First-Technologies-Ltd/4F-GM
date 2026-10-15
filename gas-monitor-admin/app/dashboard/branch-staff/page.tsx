'use client';

import { Suspense } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { branchStaffModule } from '@/admin/modules/branch-staff';
import { LoadingState } from '@/admin/primitives/states';

export default function BranchStaffPage() {
  // useSearchParams (inside useResource) requires a Suspense boundary.
  return (
    <Suspense fallback={<LoadingState />}>
      <ResourceList config={branchStaffModule} />
    </Suspense>
  );
}
