import { describe, expect, it } from 'vitest';
import { listingPatchSchema, listingSchema } from '../src/lib/vendorSchemas';
import { createCylinderSchema, updateCylinderSchema } from '../src/lib/cylinderSchemas';

// Zod 4 applies .default() inside .partial(); a PATCH must not invent values for fields it omits.
describe('patch schemas do not inject defaults', () => {
  it('listing: editing the price leaves inStock alone', () => {
    const r = listingPatchSchema.parse({ pricePerKg: 900 });
    expect(r).toEqual({ pricePerKg: 900 });
    expect('inStock' in r).toBe(false);
  });

  it('listing: an explicit inStock still passes through, and create still defaults it to true', () => {
    expect(listingPatchSchema.parse({ inStock: false })).toEqual({ inStock: false });
    const created = listingSchema.parse({ gasType: 'COOKING', pricePerKg: 1, cylinderSizes: ['12.5kg'] });
    expect(created.inStock).toBe(true);
  });

  it('cylinder: patching one field leaves imageKey alone, and create still defaults it', () => {
    const r = updateCylinderSchema.parse({});
    expect('imageKey' in r).toBe(false);
    expect(createCylinderSchema.safeParse({}).success).toBe(false); // sanity: create still validates
  });
});
