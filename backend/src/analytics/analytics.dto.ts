import { z } from 'zod';
import { uuidDto } from '../activities/activity.dto.js';
export const availabilityReceiptDto = z.object({
  activityId: uuidDto,
  clientId: z.string().min(8).max(100),
  publishedAt: z.number().int().positive(),
  platform: z.enum(['web', 'flutter']),
});
