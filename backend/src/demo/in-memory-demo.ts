import { randomUUID } from 'node:crypto';
import type express from 'express';

type Realtime = { publish(event: object): Promise<unknown> };
type Role = 'host' | 'booker' | 'guest';
type Rail = 'vouch' | 'public';

type User = { id: string; displayName: string; role: Role; featureVariant: string };
type Activity = {
  id: string;
  hostId: string;
  title: string;
  description: string;
  startsAt: string;
  priceCents: number;
  capacity: number;
};
type Invite = {
  code: string;
  activityId: string;
  inviterId: string;
  rail: Rail;
  contactName?: string;
  expiresAt?: string;
  claimed: boolean;
};

const ids = {
  host: '00000000-0000-4000-8000-000000000001',
  booker: '00000000-0000-4000-8000-000000000002',
  holdout: '00000000-0000-4000-8000-000000000003',
  guest: '00000000-0000-4000-8000-000000000004',
};

const users: User[] = [
  { id: ids.host, displayName: 'Ada — Host', role: 'host', featureVariant: 'treatment' },
  { id: ids.booker, displayName: 'Ben — Booker', role: 'booker', featureVariant: 'treatment' },
  { id: ids.holdout, displayName: 'Mina — Holdout', role: 'booker', featureVariant: 'holdout' },
  { id: ids.guest, displayName: 'Guest preview', role: 'guest', featureVariant: 'treatment' },
];

const activities: Activity[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    hostId: ids.host,
    title: 'Sunset Kayaking',
    description: 'A calm golden-hour paddle with a small local group.',
    startsAt: new Date(Date.now() + 4 * 86400000).toISOString(),
    priceCents: 4500,
    capacity: 8,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    hostId: ids.host,
    title: 'Secret Speakeasy Tour',
    description: 'Follow the clues through hidden Lagos cocktail rooms.',
    startsAt: new Date(Date.now() + 9 * 86400000).toISOString(),
    priceCents: 6500,
    capacity: 4,
  },
];

const bookings: Array<{ id: string; activityId: string; userId: string; source: 'direct' | 'invite' }> = [];
const invites: Invite[] = [];

function activityResponse(activity: Activity) {
  const used = bookings.filter((booking) => booking.activityId === activity.id).length;
  const host = users.find((user) => user.id === activity.hostId);
  return {
    id: activity.id,
    title: activity.title,
    description: activity.description,
    starts_at: activity.startsAt,
    price_cents: activity.priceCents,
    capacity: activity.capacity,
    available_spots: activity.capacity - used,
    host_name: host?.displayName ?? 'Host',
  };
}

function inviteCode() {
  let code = '';
  do code = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  while (invites.some((invite) => invite.code === code));
  return code;
}

export function registerInMemoryDemoRoutes(app: express.Express, realtime: Realtime) {
  app.get('/demo-users', (_request, response) => response.json(users));
  app.post('/feature-exposure', (_request, response) => response.status(204).end());
  app.get('/activities', (_request, response) => response.json(activities.map(activityResponse)));
  app.get('/activities/:id', (request, response) => {
    const activity = activities.find((item) => item.id === request.params.id);
    if (!activity) return response.status(404).json({ error: 'Activity not found' });
    response.json(activityResponse(activity));
  });
  app.post('/activities', (request, response) => {
    const host = users.find((user) => user.id === request.body.hostId && user.role === 'host');
    if (!host) return response.status(403).json({ error: 'Only hosts can create activities' });
    const activity: Activity = {
      id: randomUUID(),
      hostId: host.id,
      title: request.body.title,
      description: request.body.description,
      startsAt: request.body.startsAt,
      priceCents: request.body.priceCents,
      capacity: request.body.capacity,
    };
    activities.push(activity);
    response.status(201).json(activityResponse(activity));
  });
  app.post('/activities/:id/book', async (request, response) => {
    const activity = activities.find((item) => item.id === request.params.id);
    const user = users.find((item) => item.id === request.body.userId);
    if (!activity || !user) return response.status(404).json({ error: 'Activity or user not found' });
    if (new Date(activity.startsAt) <= new Date())
      return response.status(410).json({ error: 'This activity has already started and can no longer be booked.' });
    if (bookings.some((booking) => booking.activityId === activity.id && booking.userId === user.id))
      return response.status(409).json({ error: 'You already have a spot in this activity.' });
    if (bookings.filter((booking) => booking.activityId === activity.id).length >= activity.capacity)
      return response.status(409).json({ error: 'This activity just sold out. Try another plan.' });
    const booking = { id: randomUUID(), activityId: activity.id, userId: user.id, source: 'direct' as const };
    bookings.push(booking);
    const publishedAt = Date.now();
    const snapshot = activityResponse(activity);
    await realtime.publish({ activityId: activity.id, availableSpots: snapshot.available_spots, publishedAt });
    response.status(201).json({ booking, activity: snapshot, publishedAt });
  });
  app.post('/activities/:id/invites', (request, response) => {
    const activity = activities.find((item) => item.id === request.params.id);
    const inviter = users.find((item) => item.id === request.body.inviterId);
    if (!activity || !inviter) return response.status(404).json({ error: 'Activity or inviter not found' });
    if (new Date(activity.startsAt) <= new Date())
      return response.status(410).json({ error: 'This activity has already started; its share code is no longer valid.' });
    if (bookings.filter((booking) => booking.activityId === activity.id).length >= activity.capacity)
      return response.status(409).json({ error: 'This activity is at capacity, so a share code cannot be created.' });
    const eligible = bookings.some((booking) => booking.activityId === activity.id && booking.userId === inviter.id && booking.source === 'direct');
    if (!eligible) return response.status(403).json({ error: 'Book a spot before inviting friends.' });
    if (request.body.rail === 'vouch' && !request.body.contactName)
      return response.status(400).json({ error: 'A vouch invite needs a contact name.' });
    const invite: Invite = {
      code: inviteCode(),
      activityId: activity.id,
      inviterId: inviter.id,
      rail: request.body.rail,
      contactName: request.body.contactName,
      expiresAt: activity.startsAt,
      claimed: false,
    };
    invites.push(invite);
    response.status(201).json({ ...invite, expires_at: invite.expiresAt });
  });
  app.get('/invites/:code', (request, response) => {
    const invite = invites.find((item) => item.code === request.params.code.toUpperCase());
    const activity = invite && activities.find((item) => item.id === invite.activityId);
    if (!invite || !activity) return response.status(404).json({ error: 'Invite not found' });
    const inviter = users.find((user) => user.id === invite.inviterId);
    const snapshot = activityResponse(activity);
    if (new Date(activity.startsAt) <= new Date() || (invite.expiresAt && new Date(invite.expiresAt) <= new Date()))
      return response.status(410).json({ error: 'This share code has expired because the activity has started.' });
    if (snapshot.available_spots <= 0)
      return response.status(409).json({ error: 'This share code is no longer valid because the activity is full.' });
    response.json({
      ...invite,
      expires_at: invite.expiresAt,
      title: activity.title,
      inviter: { displayName: inviter?.displayName ?? 'A friend' },
      availableSpots: snapshot.available_spots,
      activity: snapshot,
    });
  });
  app.post('/invites/:code/claim', async (request, response) => {
    const invite = invites.find((item) => item.code === request.params.code.toUpperCase());
    const activity = invite && activities.find((item) => item.id === invite.activityId);
    if (!invite || !activity) return response.status(404).json({ error: 'Invite not found' });
    if (new Date(activity.startsAt) <= new Date() || (invite.expiresAt && new Date(invite.expiresAt) <= new Date())) return response.status(410).json({ error: 'This share code has expired because the activity has started.' });
    if (invite.rail === 'vouch' && invite.claimed) return response.status(409).json({ error: 'This vouch invite has already been claimed.' });
    if (bookings.filter((booking) => booking.activityId === activity.id).length >= activity.capacity)
      return response.status(409).json({ error: 'This activity just sold out.' });
    const guest = { id: randomUUID(), displayName: request.body.displayName, role: 'guest' as const, featureVariant: 'treatment' };
    users.push(guest);
    const booking = { id: randomUUID(), activityId: activity.id, userId: guest.id, source: 'invite' as const };
    bookings.push(booking);
    invite.claimed = true;
    const publishedAt = Date.now();
    const snapshot = activityResponse(activity);
    await realtime.publish({ activityId: activity.id, availableSpots: snapshot.available_spots, publishedAt });
    response.status(201).json({ invite, guest, booking, activity: snapshot, publishedAt });
  });
  app.post('/availability/receipt', (_request, response) => response.status(204).end());
  app.get('/metrics', (_request, response) => {
    const bookingAttempts = bookings.filter((booking) => booking.source === 'direct').length;
    const shareClaims = bookings.filter((booking) => booking.source === 'invite').length;
    response.json({
      slo: {
        noOversell: activities.every(
          (activity) => bookings.filter((booking) => booking.activityId === activity.id).length <= activity.capacity,
        ),
        maxOversoldBookings: 0,
        qualifiedBookingSuccessRate: bookingAttempts ? 1 : null,
        soldOutRejections: 0,
        availabilityP95Ms: null,
      },
      product: {
        bookerInviteRate: bookingAttempts ? (invites.length ? 1 : 0) : null,
        inviteOpenToClaimRate: invites.length ? shareClaims / invites.length : null,
        kFactorByRail: (['vouch', 'public'] as const).map((rail) => ({
          rail,
          invites: invites.filter((invite) => invite.rail === rail).length,
          claims: 0,
        })),
      },
    });
  });
}
