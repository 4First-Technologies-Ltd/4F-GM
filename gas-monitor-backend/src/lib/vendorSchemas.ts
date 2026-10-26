import { z } from 'zod';

export const listingSchema = z.object({
  // Optional: omitted means the vendor's main branch. Ownership is checked in the route.
  branchId: z.string().uuid().optional(),
  gasType: z.enum(['COOKING', 'MEDICAL', 'INDUSTRIAL', 'BULK', 'OTHER']),
  customName: z.string().optional(),
  pricePerKg: z.number().positive('Price per kg must be positive'),
  cylinderSizes: z.array(z.string()).min(1, 'Select at least one cylinder size'),
  otherSizes: z.string().optional(),
  inStock: z.boolean().optional().default(true)
});

/**
 * Partial update. Zod 4 applies `.default()` inside `.partial()`, which would reset `inStock` to true
 * whenever a vendor edits anything else, so the patch schema redeclares it without the default.
 */
export const listingPatchSchema = listingSchema.partial().extend({ inStock: z.boolean().optional() });
