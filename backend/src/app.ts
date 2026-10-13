import { Prisma, Rail, Role } from '@prisma/client';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';

import { ActivityController } from './activities/activity.controller.js';
import { bookActivityDto, uuidDto } from './activities/activity.dto.js';
import { ActivityService } from './activities/activity.service.js';
import { AnalyticsController } from './analytics/analytics.controller.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { ApiError } from './common/api-error.js';
import { SystemController } from './controllers/system.controller.js';
import { registerInMemoryDemoRoutes } from './demo/in-memory-demo.js';
import { claimInviteDto, createInviteDto } from './invites/invite.dto.js';
import { InviteService } from './invites/invite.service.js';
import { prisma } from './prisma.js';

type Realtime = { publish(event: object): Promise<unknown> };

async function completeBestEffort(
  operations: Array<{ name: string; run: () => Promise<unknown> }>,
) {
  const results = await Promise.allSettled(
    operations.map((operation) => Promise.resolve().then(operation.run)),
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected')
      console.error(`Non-critical ${operations[index].name} failed`, result.reason);
  });
}

const apiDoc = {
  openapi: '3.1.0',
  info: {
    title: 'Velio Group Booking API',
    version: '1.0.0',
    description:
      'Demo identities are sent as `userId` in request bodies; production would use authenticated subjects.',
  },
  paths: {
    '/activities': {
      get: {
        summary: 'List activity availability',
        responses: { '200': { description: 'Activities' } },
      },
      post: {
        summary: 'Create activity',
        responses: {
          '201': { description: 'Created' },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/activities/{id}/book': {
      post: {
        summary: 'Atomically book one spot',
        responses: {
          '201': { description: 'Booked' },
          '409': { description: 'Sold out or already booked' },
        },
      },
    },
    '/invites/{code}/claim': {
      post: {
        summary: 'Claim an invite atomically',
        responses: {
          '201': { description: 'Claimed' },
          '409': { description: 'Sold out or used vouch' },
          '410': { description: 'Expired vouch' },
        },
      },
    },
    '/activities/{id}/invites': {
      post: {
        summary: 'Generate a share code after booking an upcoming activity',
        responses: {
          '201': { description: 'Share code created' },
          '403': { description: 'Booker has not reserved a spot' },
          '409': { description: 'Activity is at capacity' },
          '410': { description: 'Activity has already started' },
        },
      },
    },
    '/metrics': {
      get: {
        summary: 'SLO and product funnel report',
        responses: { '200': { description: 'Metrics' } },
      },
    },
  },
};
export function createApp(realtime: Realtime) {
  const analytics = new AnalyticsService();
  const systemController = new SystemController();
  const activityController = new ActivityController();
  const activities = new ActivityService();
  const inviteService = new InviteService();
  const analyticsController = new AnalyticsController();
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(apiDoc));
  app.get('/openapi.json', (_q, r) => r.json(apiDoc));
  app.get('/health', systemController.health);
  if (process.env.DEMO_MODE === 'true') {
    registerInMemoryDemoRoutes(app, realtime);
    return app;
  }
  app.get('/demo-users', systemController.demoUsers);
  app.post('/feature-exposure', systemController.recordInviteExposure);
  app.get('/activities', activityController.list);
  app.get('/activities/:id', activityController.getById);
  app.post('/activities', activityController.create);
  app.post('/activities/:id/book', async (q, r, next) => {
    try {
      const activityId = uuidDto.parse(q.params.id);
      const { userId } = bookActivityDto.parse(q.body);
      await analytics.track('booking_attempted', { userId, activityId });
      const booking = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM activities WHERE id=${activityId}::uuid FOR UPDATE`;
        const [a, user, used] = await Promise.all([
          tx.activity.findUnique({ where: { id: activityId } }),
          tx.user.findUnique({ where: { id: userId } }),
          tx.booking.count({ where: { activityId } }),
        ]);
        if (!a) throw new ApiError(404, 'Activity not found');
        if (!user) throw new ApiError(404, 'User not found');
        if (a.startsAt <= new Date())
          throw new ApiError(410, 'This activity has already started and can no longer be booked.');
        if (used >= a.capacity)
          throw new ApiError(409, 'This activity just sold out. Try another plan.');
        const plan = await tx.plan.upsert({
          where: { activityId_ownerId: { activityId, ownerId: userId } },
          update: {},
          create: { activityId, ownerId: userId },
        });
        try {
          return await tx.booking.create({
            data: { activityId, planId: plan.id, userId, source: 'direct' },
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            throw new ApiError(409, 'You already have a spot in this activity.');
          throw e;
        }
      });
      const a = await activities.getById(activityId);
      const publishedAt = Date.now();
      await completeBestEffort([
        {
          name: 'booking success analytics',
          run: () => analytics.track('booking_succeeded', { userId, activityId }),
        },
        {
          name: 'booking availability notification',
          run: () =>
            realtime.publish({ activityId, availableSpots: a.availableSpots, publishedAt }),
        },
      ]);
      r.status(201).json({ booking, activity: a, publishedAt });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.message.includes('sold out'))
        await completeBestEffort([
          {
            name: 'sold-out analytics',
            run: () => analytics.track('booking_sold_out', { activityId: q.params.id }),
          },
        ]);
      next(e);
    }
  });
  app.post('/activities/:id/invites', async (q, r, next) => {
    try {
      const activityId = uuidDto.parse(q.params.id);
      const body = createInviteDto.parse(q.body);
      if (body.rail === Rail.vouch && !body.contactName)
        throw new ApiError(400, 'A vouch invite needs a contact name.');
      const [a, inviter] = await Promise.all([
        prisma.activity.findUnique({ where: { id: activityId } }),
        prisma.user.findUnique({ where: { id: body.inviterId } }),
      ]);
      if (!a || !inviter) throw new ApiError(404, 'Activity or inviter not found');
      if (a.startsAt <= new Date())
        throw new ApiError(
          410,
          'This activity has already started; its share code is no longer valid.',
        );
      if ((await prisma.booking.count({ where: { activityId } })) >= a.capacity)
        throw new ApiError(409, 'This activity is at capacity, so a share code cannot be created.');
      if (
        !(await prisma.booking.findFirst({
          where: { activityId, userId: inviter.id, source: 'direct' },
        }))
      )
        throw new ApiError(403, 'Book a spot before inviting friends.');
      if (inviter.featureVariant === 'holdout' || !a.inviteFeatureEnabled)
        throw new ApiError(403, 'Invites are not enabled for this account yet.');
      const plan = await prisma.plan.upsert({
        where: { activityId_ownerId: { activityId, ownerId: inviter.id } },
        update: {},
        create: { activityId, ownerId: inviter.id },
      });
      const invite = await prisma.invite.create({
        data: {
          code: inviteService.generateCode(),
          activityId,
          planId: plan.id,
          inviterId: inviter.id,
          rail: body.rail,
          contactName: body.contactName,
          // Codes always stop working when the activity begins. Capacity is checked at
          // read/claim time because it changes as friends join.
          expiresAt: a.startsAt,
        },
      });
      await analytics.track('invite_created', {
        userId: inviter.id,
        activityId,
        inviteId: invite.id,
        rail: invite.rail,
        payload: { featureVariant: inviter.featureVariant },
      });
      r.status(201).json(invite);
    } catch (e) {
      next(e);
    }
  });
  app.get('/invites/:code', async (q, r, next) => {
    try {
      const invite = await prisma.invite.findUnique({
        where: { code: q.params.code.toUpperCase() },
        include: {
          inviter: { select: { displayName: true } },
          activity: { include: { _count: { select: { bookings: true } } } },
          _count: { select: { claims: true } },
        },
      });
      if (!invite) throw new ApiError(404, 'Invite not found');
      const now = new Date();
      const availableSpots = invite.activity.capacity - invite.activity._count.bookings;
      if (invite.activity.startsAt <= now || (invite.expiresAt && invite.expiresAt <= now))
        throw new ApiError(410, 'This share code has expired because the activity has started.');
      if (availableSpots <= 0)
        throw new ApiError(409, 'This share code is no longer valid because the activity is full.');
      const viewerId =
        typeof q.query.viewerId === 'string' ? uuidDto.safeParse(q.query.viewerId) : null;
      const viewer = viewerId?.success
        ? await prisma.user.findUnique({ where: { id: viewerId.data } })
        : null;
      await analytics.track('invite_opened', {
        userId: viewer?.id,
        activityId: invite.activityId,
        inviteId: invite.id,
        rail: invite.rail,
        payload: viewer
          ? { featureVariant: viewer.featureVariant }
          : { featureVariant: 'anonymous' },
      });
      r.json({
        ...invite,
        activity: {
          ...invite.activity,
          starts_at: invite.activity.startsAt,
          price_cents: invite.activity.priceCents,
          available_spots: availableSpots,
        },
        availableSpots,
      });
    } catch (e) {
      next(e);
    }
  });
  app.post('/invites/:code/claim', async (q, r, next) => {
    try {
      const { displayName } = claimInviteDto.parse(q.body);
      const result = await prisma.$transaction(async (tx) => {
        const invite = await tx.invite.findUnique({
          where: { code: q.params.code.toUpperCase() },
          include: { activity: true, inviter: true },
        });
        if (!invite) throw new ApiError(404, 'Invite not found');
        await tx.$queryRaw`SELECT id FROM activities WHERE id=${invite.activityId}::uuid FOR UPDATE`;
        if (
          invite.activity.startsAt <= new Date() ||
          (invite.expiresAt && invite.expiresAt <= new Date())
        )
          throw new ApiError(410, 'This share code has expired because the activity has started.');
        if (
          invite.rail === Rail.vouch &&
          (await tx.inviteClaim.findFirst({ where: { inviteId: invite.id } }))
        )
          throw new ApiError(409, 'This vouch invite has already been claimed.');
        const used = await tx.booking.count({ where: { activityId: invite.activityId } });
        if (used >= invite.activity.capacity)
          throw new ApiError(409, 'This activity just sold out.');
        const guest = await tx.user.create({
          data: {
            displayName,
            role: Role.guest,
            inviteGeneration: invite.inviter.inviteGeneration + 1,
            firstInviterId: invite.inviterId,
            firstInviteId: invite.id,
            featureVariant: 'treatment',
          },
        });
        const booking = await tx.booking.create({
          data: {
            activityId: invite.activityId,
            planId: invite.planId,
            userId: guest.id,
            source: 'invite',
            inviteId: invite.id,
          },
        });
        await tx.inviteClaim.create({
          data: {
            inviteId: invite.id,
            guestId: guest.id,
            bookingId: booking.id,
            rail: invite.rail,
            generation: guest.inviteGeneration,
          },
        });
        return { invite, guest, booking };
      });
      const a = await activities.getById(result.invite.activityId);
      const publishedAt = Date.now();
      await completeBestEffort([
        {
          name: 'invite claim analytics',
          run: () =>
            analytics.track('invite_claimed', {
              userId: result.guest.id,
              activityId: result.invite.activityId,
              inviteId: result.invite.id,
              rail: result.invite.rail,
            }),
        },
        {
          name: 'invite claim availability notification',
          run: () =>
            realtime.publish({ activityId: a.id, availableSpots: a.availableSpots, publishedAt }),
        },
      ]);
      r.status(201).json({ ...result, activity: a, publishedAt });
    } catch (e) {
      next(e);
    }
  });
  app.post('/availability/receipt', analyticsController.recordAvailabilityReceipt);
  app.get('/metrics', async (_q, r, next) => {
    try {
      const [attempts, successes, soldOut, bookers, inviters, opens, claims, receipts, activities] =
        await Promise.all([
          prisma.analyticsEvent.count({ where: { eventName: 'booking_attempted' } }),
          prisma.analyticsEvent.count({ where: { eventName: 'booking_succeeded' } }),
          prisma.analyticsEvent.count({ where: { eventName: 'booking_sold_out' } }),
          prisma.analyticsEvent.findMany({
            where: { eventName: 'booking_succeeded', userId: { not: null } },
            distinct: ['userId'],
            select: { userId: true },
          }),
          prisma.analyticsEvent.findMany({
            where: { eventName: 'invite_created', userId: { not: null } },
            distinct: ['userId'],
            select: { userId: true },
          }),
          prisma.analyticsEvent.count({ where: { eventName: 'invite_opened' } }),
          prisma.analyticsEvent.count({ where: { eventName: 'invite_claimed' } }),
          prisma.availabilityReceipt.findMany({ select: { publishedAt: true, receivedAt: true } }),
          prisma.activity.findMany({
            select: { capacity: true, _count: { select: { bookings: true } } },
          }),
        ]);
      const delays = receipts
        .map((x) => x.receivedAt.getTime() - x.publishedAt.getTime())
        .sort((a, b) => a - b);
      const rails = await Promise.all(
        [Rail.vouch, Rail.public].map(async (rail) => ({
          rail,
          claims: await prisma.analyticsEvent.count({
            where: { eventName: 'invite_claimed', rail },
          }),
          invites: await prisma.analyticsEvent.count({
            where: { eventName: 'invite_created', rail },
          }),
        })),
      );
      r.json({
        slo: {
          noOversell: activities.every((activity) => activity._count.bookings <= activity.capacity),
          maxOversoldBookings: Math.max(
            0,
            ...activities.map((activity) => activity._count.bookings - activity.capacity),
          ),
          qualifiedBookingSuccessRate: attempts ? successes / attempts : null,
          soldOutRejections: soldOut,
          availabilityP95Ms: delays.length ? delays[Math.ceil(delays.length * 0.95) - 1] : null,
        },
        product: {
          bookerInviteRate: bookers.length
            ? inviters.filter((i) => bookers.some((b) => b.userId === i.userId)).length /
              bookers.length
            : null,
          inviteOpenToClaimRate: opens ? claims / opens : null,
          kFactorByRail: rails,
        },
      });
    } catch (e) {
      next(e);
    }
  });
  app.use((err: unknown, _q: express.Request, r: express.Response, next: express.NextFunction) => {
    void next;
    console.error(err);
    const e =
      err instanceof ApiError
        ? err
        : new ApiError(
            err instanceof z.ZodError ? 400 : 500,
            err instanceof Error ? err.message : 'Unexpected error',
          );
    r.status(e.status).json({ error: e.message });
  });
  return app;
}
