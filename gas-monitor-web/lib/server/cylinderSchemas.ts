import { z } from 'zod';

const IMAGE_KEYS = ['6kg', '12.5kg', '50kg'] as const;

export const createCylinderSchema = z.object({
  name: z.string().min(1, 'Profile name is required').max(50),
  sizeKg: z.number().positive('Size must be a positive number'),
  customSizeLabel: z.string().optional(),
  imageKey: z.enum(IMAGE_KEYS).default('12.5kg')
});

export const updateCylinderSchema = createCylinderSchema.partial();
