import { z } from 'zod';

export const listingSchema = z.object({
  gasType: z.enum(['COOKING', 'MEDICAL', 'INDUSTRIAL', 'BULK', 'OTHER']),
  customName: z.string().optional(),
  pricePerKg: z.number().positive('Price per kg must be positive'),
  cylinderSizes: z.array(z.string()).min(1, 'Select at least one cylinder size'),
  otherSizes: z.string().optional(),
  inStock: z.boolean().optional().default(true)
});
