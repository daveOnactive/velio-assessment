import { Role } from '@prisma/client';
import { ApiError } from '../common/api-error.js';
import { prisma } from '../prisma.js';

function toResponse(activity: {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  priceCents: number;
  capacity: number;
  host: { displayName: string };
  _count: { bookings: number };
}) {
  const availableSpots = activity.capacity - activity._count.bookings;
  return {
    id: activity.id,
    title: activity.title,
    description: activity.description,
    startsAt: activity.startsAt,
    starts_at: activity.startsAt,
    priceCents: activity.priceCents,
    price_cents: activity.priceCents,
    capacity: activity.capacity,
    host_name: activity.host.displayName,
    availableSpots,
    available_spots: availableSpots,
  };
}

export class ActivityService {
  async list() {
    const activities = await prisma.activity.findMany({
      include: { host: { select: { displayName: true } }, _count: { select: { bookings: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return activities.map(toResponse);
  }
  async getById(id: string) {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: { host: { select: { displayName: true } }, _count: { select: { bookings: true } } },
    });
    if (!activity) throw new ApiError(404, 'Activity not found');
    return toResponse(activity);
  }
  async create(input: {
    hostId: string;
    title: string;
    description: string;
    startsAt: string;
    priceCents: number;
    capacity: number;
  }) {
    const host = await prisma.user.findUnique({ where: { id: input.hostId } });
    if (!host || host.role !== Role.host)
      throw new ApiError(403, 'Only hosts can create activities');
    return prisma.activity.create({ data: { ...input, startsAt: new Date(input.startsAt) } });
  }
}
