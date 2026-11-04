import { describe, expect, it } from 'vitest';
import { pickReorderOptions, sizeLabelFor, type ReorderListing } from '../src/lib/deviceReorder';

const listing = (over: Partial<ReorderListing> = {}): ReorderListing => ({
  id: 'l1', vendorId: 'v1', pricePerKg: 1000, cylinderSizes: ['6 kg', '12.5 kg'], otherSizes: null,
  vendor: { businessName: 'Alpha Gas' }, branch: { name: 'Main branch', isMain: true, city: 'Lagos' }, ...over,
});

describe('size matching', () => {
  it('finds the listing\'s own label for the device\'s cylinder', () => {
    expect(sizeLabelFor(listing(), 12.5)).toBe('12.5 kg');
    expect(sizeLabelFor(listing({ cylinderSizes: ['12.5kg'] }), 12.5)).toBe('12.5kg');
  });
  it('also reads the vendor\'s free-text extra sizes', () => {
    expect(sizeLabelFor(listing({ cylinderSizes: [], otherSizes: '3 kg, 25 kg' }), 25)).toBe('25 kg');
  });
  it('does not match a size the vendor does not sell', () => {
    expect(sizeLabelFor(listing(), 50)).toBeNull();
  });
});

describe('ranking', () => {
  const cheap = listing({ id: 'cheap', vendorId: 'v2', pricePerKg: 900, vendor: { businessName: 'Cheap Gas' } });
  const known = listing({ id: 'known', vendorId: 'v3', pricePerKg: 1200, vendor: { businessName: 'Known Gas' } });
  it('puts vendors the customer has used first, then the cheapest', () => {
    const out = pickReorderOptions(12.5, [listing(), cheap, known], new Set(['v3']));
    expect(out.map((o) => o.listingId)).toEqual(['known', 'cheap', 'l1']);
    expect(out[0].previous).toBe(true);
  });
  it('prices one cylinder plus the delivery fee, and offers only listings that sell the size', () => {
    const out = pickReorderOptions(12.5, [cheap, listing({ id: 'small', cylinderSizes: ['6 kg'] })], new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ unitPrice: 11250, total: 13250, cylinderSize: '12.5 kg' });
  });
  it('names a branch only when it is not the seed main branch', () => {
    const out = pickReorderOptions(12.5, [listing({ branch: { name: 'Ikeja', isMain: false, city: 'Lagos' } })], new Set());
    expect(out[0].branchName).toBe('Ikeja');
    expect(pickReorderOptions(12.5, [listing()], new Set())[0].branchName).toBeNull();
  });
  it('caps the list', () => {
    const many = Array.from({ length: 12 }, (_, i) => listing({ id: `l${i}`, pricePerKg: 1000 + i }));
    expect(pickReorderOptions(12.5, many, new Set())).toHaveLength(5);
  });
});
