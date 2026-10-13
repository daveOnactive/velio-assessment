import { createClient } from 'redis';
import type { Server } from 'socket.io';

const url = process.env.REDIS_URL || 'redis://localhost:6379';
export async function startRealtime(io: Server) {
  const subscriber = createClient({ url, socket: { reconnectStrategy: false } });
  const publisher = createClient({ url, socket: { reconnectStrategy: false } });
  subscriber.on('error', console.error);
  publisher.on('error', console.error);
  try {
    await Promise.all([subscriber.connect(), publisher.connect()]);
    await subscriber.subscribe('availability', (message) => {
      const event = JSON.parse(message);
      io.to(`activity:${event.activityId}`).emit('availability', event);
    });
    return { publish: (event: object) => publisher.publish('availability', JSON.stringify(event)) };
  } catch (error) {
    console.warn('Redis is unavailable; using in-process availability events.', error);
    if (subscriber.isOpen) subscriber.disconnect();
    if (publisher.isOpen) publisher.disconnect();
    return {
      publish: async (event: { activityId?: string }) => {
        if (event.activityId) io.to(`activity:${event.activityId}`).emit('availability', event);
      },
    };
  }
}
