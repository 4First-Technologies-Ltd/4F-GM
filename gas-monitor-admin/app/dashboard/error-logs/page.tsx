'use client';

import { Suspense } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { errorLogsModule } from '@/admin/modules/error-logs';
import { LoadingState } from '@/admin/primitives/states';

export default function ErrorLogsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResourceList
        config={errorLogsModule}
        toolbar={() => (
          // An empty list here must never read as "no attacks".
          <div className="adm-alert" role="note">
            <span>
              <strong>Not connected yet.</strong> The backend does not persist errors — they go to
              Sentry and on to Telegram, but nothing is stored. An empty list here means no data
              source, not a quiet system.
            </span>
          </div>
        )}
      />
    </Suspense>
  );
}
