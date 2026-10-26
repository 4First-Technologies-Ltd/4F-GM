import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { addressApi, type SavedAddress } from '@/lib/api';

/**
 * The signed-in user's saved delivery addresses, kept on the server so they
 * match the website. Every change refetches: the server owns which one is the
 * default (and does not promote another when the default is deleted).
 */
export function useAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setAddresses(await addressApi.list());
      setError('');
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your addresses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  /** Rejects with the API error so the caller can show it. Returns the new address. */
  const add = useCallback(async (label: string, fullAddress: string) => {
    const created = await addressApi.create({ label, fullAddress, isDefault: addresses.length === 0 });
    await reload();
    return created;
  }, [addresses.length, reload]);

  const setDefault = useCallback(async (id: string) => {
    await addressApi.update(id, { isDefault: true });
    await reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    const wasDefault = addresses.find((a) => a.id === id)?.isDefault;
    await addressApi.remove(id);
    if (wasDefault) {
      const next = addresses.find((a) => a.id !== id);
      if (next) await addressApi.update(next.id, { isDefault: true });
    }
    await reload();
  }, [addresses, reload]);

  return { addresses, loading, error, reload, add, setDefault, remove };
}
