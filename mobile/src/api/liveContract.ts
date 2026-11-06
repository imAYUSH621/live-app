import type { LiveJoinResponse, LiveRoom } from './types';

// The native adapter uses the same /live contract as the web client. Keep
// payload translation here rather than inventing a parallel /rooms API.
export function makeLiveApi(api: {get: Function; post: Function}) {
  return {
    getRooms: async (category?: string, tab = 'all'): Promise<LiveRoom[]> => {
      const feedTab = tab !== 'all' ? tab : category === 'pk battle' ? 'pk' : 'popular';
      const rooms = await api.get(`/live/feed?tab=${encodeURIComponent(feedTab)}`);
      return rooms.map((room: any) => ({
        ...room,
        viewer_count: room.viewers ?? room.viewer_count ?? 0,
        host: room.host ?? { id: room.host_id, name: room.host_name, avatar_url: room.host_avatar },
      }));
    },
    createRoom: async (data: {title: string; category: string; mode?: string; cover_url?: string}): Promise<LiveJoinResponse> =>
      normalizeJoin(await api.post('/live/start', { ...data, type: data.mode === 'audio' ? 'audio' : 'video' })),
    joinRoom: async (id: number, password?: string): Promise<LiveJoinResponse> =>
      normalizeJoin(await api.post(`/live/${id}/join`, password ? { password } : {})),
    endRoom: (id: number): Promise<{ok: boolean; summary?: any}> => api.post(`/live/${id}/end`),
    // Leaving is a socket room:leave event, not a nonexistent HTTP route.
  };
}

export function normalizeJoin(data: any): LiveJoinResponse {
  const host = data.host ?? data.room?.host ?? data.state?.host;
  if (!data.room || !host || !data.token || !data.livekit_url) throw new Error('Incomplete live room response');
  const state = data.state ?? {};
  return {
    ...data,
    room: { ...data.room, viewer_count: state.viewers ?? data.room.viewer_count ?? 0, likes: state.likes ?? data.room.likes ?? 0 },
    host,
    seats: data.seats ?? state.seats ?? [],
    pk: data.pk ?? state.pk,
  };
}
