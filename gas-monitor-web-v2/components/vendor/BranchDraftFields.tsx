'use client';

import { useState } from 'react';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import type { BranchInput } from '@/lib/api';

/**
 * Extra branches at vendor sign-up. The business address above the form is the
 * main branch; anything added here is created alongside it. The server enforces
 * the plan's branch cap, this just stops the list growing past it.
 */
export const MAX_EXTRA_BRANCHES = 4;

export function BranchDraftFields({
  branches,
  onChange,
  disabled
}: {
  branches: BranchInput[];
  onChange: (next: BranchInput[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<BranchInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!draft || !draft.name.trim() || !draft.address.trim() || !draft.phone.trim()) {
      setError('Branch name, address and phone are required.');
      return;
    }
    onChange([...branches, { name: draft.name.trim(), address: draft.address.trim(), phone: draft.phone.trim() }]);
    setDraft(null);
    setError(null);
  }

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="block text-sm font-medium text-foreground">
        Other branches <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      <p className="text-xs text-muted-foreground">
        Only have one location? Skip this. The address above is your main branch, and you can add more at any time from the Branches page.
      </p>

      {branches.map((b, i) => (
        <div key={i} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium text-foreground">{b.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {b.address} · {b.phone}
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-destructive hover:text-destructive/80"
            onClick={() => onChange(branches.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}

      {draft ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Input
            label="Branch name"
            id="branchName"
            type="text"
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
            error={false}
            placeholder="Lekki Phase 1"
            classNames={{ root: 'w-full' }}
          />
          <Input
            label="Branch address"
            id="branchAddress"
            type="text"
            value={draft.address}
            onChange={(v) => setDraft({ ...draft, address: v })}
            error={false}
            placeholder="Street and area"
            classNames={{ root: 'w-full' }}
          />
          <Input
            label="Branch phone"
            id="branchPhone"
            type="tel"
            value={draft.phone}
            onChange={(v) => setDraft({ ...draft, phone: v })}
            error={false}
            placeholder="0801 234 5678"
            classNames={{ root: 'w-full' }}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save}>
              Add branch
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        branches.length < MAX_EXTRA_BRANCHES && (
          <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ name: '', address: '', phone: '' })}>
            Add another branch
          </Button>
        )
      )}
    </fieldset>
  );
}
