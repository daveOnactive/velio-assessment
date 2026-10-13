import { Prisma, Rail } from '@prisma/client';
import { prisma } from '../prisma.js';
export class AnalyticsService {
  async track(
    eventName: string,
    data: {
      userId?: string;
      activityId?: string;
      inviteId?: string;
      rail?: Rail;
      payload?: Prisma.InputJsonValue;
    },
  ) {
    await prisma.analyticsEvent.create({ data: { eventName, ...data } });
  }
  async recordAvailabilityReceipt(input: {
    activityId: string;
    clientId: string;
    publishedAt: number;
    platform: string;
  }) {
    await prisma.availabilityReceipt.create({
      data: { ...input, publishedAt: new Date(input.publishedAt) },
    });
    await this.track('availability_received', {
      activityId: input.activityId,
      payload: { platform: input.platform, publishedAt: input.publishedAt },
    });
  }
}
