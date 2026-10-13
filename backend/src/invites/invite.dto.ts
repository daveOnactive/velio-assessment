import { Rail } from '@prisma/client';
import { z } from 'zod';
import { uuidDto } from '../activities/activity.dto.js';
export const createInviteDto = z.object({
  inviterId: uuidDto,
  rail: z.nativeEnum(Rail),
  contactName: z.string().min(1).max(80).optional(),
});
export const claimInviteDto = z.object({ displayName: z.string().min(2).max(60) });
