import { z } from 'zod';

export const uuidDto = z.string().uuid();
export const createActivityDto = z.object({
  hostId: uuidDto,
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(2000),
  startsAt: z.string().datetime(),
  priceCents: z.number().int().nonnegative(),
  capacity: z.number().int().positive().max(1000),
});
export const bookActivityDto = z.object({ userId: uuidDto });
