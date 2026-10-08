'use client';

import { Suspense } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { ResourceList } from '@/admin/resource/resource-list';
import { adminUsersModule } from '@/admin/modules/admin-users';
import { AddAdminButton } from '@/admin/modules/add-admin-button';
import { LoadingState } from '@/admin/primitives/states';

export default function AdminUsersPage() {
  // useSearchParams (inside useResource) requires a Suspense boundary in the
  // App Router, or the whole route opts out of static rendering.
  return (
    <RequirePermission permission="admins.read">
    <Suspense fallback={<LoadingState />}>
      <ResourceList
        config={adminUsersModule}
        toolbar={({ refresh }) => (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <AddAdminButton onCreated={refresh} />
          </div>
        )}
      />
    </Suspense>
    </RequirePermission>
  );
}
