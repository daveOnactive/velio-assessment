import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { apiBaseUrl, apiClient } from '../lib/api-client';

export function useAvailability(activityId: string | undefined, queryClient: QueryClient) {
  useEffect(() => {
    if (!activityId) return;
    const clientId = crypto.randomUUID();
    const socket = io(apiBaseUrl);
    const subscribe = () => socket.emit('subscribe', { activityId });
    socket.on('connect', subscribe);
    socket.on('availability', (event) => {
      if (event.activityId === activityId) {
        apiClient<void>('/availability/receipt', {
          method: 'POST',
          body: JSON.stringify({
            activityId,
            clientId,
            publishedAt: event.publishedAt,
            platform: 'web',
          }),
        }).catch(() => undefined);
      }
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['activity', event.activityId] });
    });
    subscribe();
    return () => {
      socket.close();
    };
  }, [activityId, queryClient]);
}
