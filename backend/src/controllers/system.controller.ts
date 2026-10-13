import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { prisma } from '../prisma.js';

export class SystemController {
  private readonly analytics = new AnalyticsService();
  health = (_request: Request, response: Response) => response.json({ ok: true });

  demoUsers = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, displayName: true, role: true, featureVariant: true },
        orderBy: { createdAt: 'asc' },
      });
      response.json(users);
    } catch (error) {
      next(error);
    }
  };

  recordInviteExposure = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { userId } = z.object({ userId: z.string().uuid() }).parse(request.body);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return response.status(404).json({ error: 'User not found' });
      await this.analytics.track('invite_feature_exposed', {
        userId,
        payload: { featureVariant: user.featureVariant },
      });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
