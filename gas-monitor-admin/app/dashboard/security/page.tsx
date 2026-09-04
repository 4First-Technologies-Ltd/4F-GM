'use client';

import { Suspense } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { securityModule } from '@/admin/modules/security';
import { LoadingState } from '@/admin/primitives/states';

export default function SecurityPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResourceList
        config={securityModule}
        toolbar={() => (
          // A security page that implies protection it does not provide is worse
          // than no page at all. This notice is not decoration — remove it only
          // when enforcement actually exists.
          <div className="adm-alert" role="note">
            <span>
              <strong>Not enforced yet.</strong> This blocklist is advisory — the backend does not
              read it, and no endpoint is wired. Enforcement lands with the VPS firewall rules.
              Application-layer blocking is defence in depth, never DDoS protection.
            </span>
          </div>
        )}
      />
    </Suspense>
  );
}
