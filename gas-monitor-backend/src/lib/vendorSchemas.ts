import { z } from 'zod';

export const listingSchema = z.object({
  // Optional: omitted means the vendor's main branch. Ownership is checked in the route.
  branchId: z.string().uuid().optional(),
  gasType: z.enum(['COOKING', 'MEDICAL', 'INDUSTRIAL', 'BULK', 'OTHER']),
  customName: z.string().optional(),
  pricePerKg: z.number().positive('Price per kg must be positive'),
  // May be empty for a listing that only sells loose gas (sellsLoose); the routes enforce "sizes or loose".
  cylinderSizes: z.array(z.string()).default([]),
  // Can fill any quantity: customers may order by kg or by amount, not only by cylinder size.
  sellsLoose: z.boolean().optional().default(false),
  otherSizes: z.string().optional(),
  inStock: z.boolean().optional().default(true),
  // R2 key from POST /api/vendor/images/upload-url (kind "listing"); null clears the photo.
  imageKey: z.string().min(1).nullable().optional()
});

/**
 * Partial update. Zod 4 applies `.default()` inside `.partial()`, which would reset `inStock` to true
 * whenever a vendor edits anything else, so the patch schema redeclares it without the default.
 */
export const listingPatchSchema = listingSchema.partial().extend({ inStock: z.boolean().optional(), sellsLoose: z.boolean().optional(), cylinderSizes: z.array(z.string()).optional() });
