import { describe, expect, it } from 'vitest';
import { priceLooseOrder, DELIVERY_FEE, PricingError } from '../src/lib/pricing';
import { VERSION_PATTERN, compareVersions } from '../src/lib/appVersion';

const listing = {
  id: 'l1',
  vendorId: 'v1',
  branchId: null,
  pricePerKg: 1200,
  sellsLoose: true,
  vendor: { businessName: 'Acme Gas' }
};

describe('loose gas pricing', () => {
  it('by weight: charges price per kg, delivery on top, stores a readable size', () => {
    const p = priceLooseOrder(listing, 1, { kg: 3.5 });
    expect(p.cylinderSize).toBe('3.5 kg (loose)');
    expect(p.quantity).toBe(1);
    expect(p.unitPrice).toBe(4200);
    expect(p.totalAmount).toBe(4200 + DELIVERY_FEE);
  });

  it('rounds weight to 0.1 kg', () => {
    expect(priceLooseOrder(listing, 1, { kg: 3.54 }).cylinderSize).toBe('3.5 kg (loose)');
  });

  it('by amount: the customer pays exactly that for gas and gets the kg it buys, rounded down', () => {
    const p = priceLooseOrder(listing, 1, { amount: 5000 });
    expect(p.unitPrice).toBe(5000);
    expect(p.cylinderSize).toBe('4.16 kg (loose)'); // 5000 / 1200 = 4.1666…
    expect(p.totalAmount).toBe(5000 + DELIVERY_FEE);
  });

  it('refuses too little or too much gas', () => {
    expect(() => priceLooseOrder(listing, 1, { kg: 0.2 })).toThrow(/minimum/i);
    expect(() => priceLooseOrder(listing, 1, { amount: 300 })).toThrow(/minimum/i);
    expect(() => priceLooseOrder(listing, 1, { kg: 101 })).toThrow(/most/i);
  });

  it('needs exactly one of kg or amount, and a quantity of 1', () => {
    expect(() => priceLooseOrder(listing, 1, {})).toThrow(PricingError);
    expect(() => priceLooseOrder(listing, 1, { kg: 2, amount: 3000 })).toThrow(PricingError);
    expect(() => priceLooseOrder(listing, 2, { kg: 2 })).toThrow(/quantity of 1/);
  });

  it('is refused when the vendor did not opt in', () => {
    expect(() => priceLooseOrder({ ...listing, sellsLoose: false }, 1, { kg: 2 })).toThrow(/does not sell loose/);
  });
});

describe('app version gate', () => {
  it('accepts only x.y.z', () => {
    expect(VERSION_PATTERN.test('1.0.0')).toBe(true);
    expect(VERSION_PATTERN.test('1.10.2')).toBe(true);
    expect(VERSION_PATTERN.test('1.0')).toBe(false);
    expect(VERSION_PATTERN.test('v1.0.0')).toBe(false);
  });

  it('compares by number, not text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
  });
});
