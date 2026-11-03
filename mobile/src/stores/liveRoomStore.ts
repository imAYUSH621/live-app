import { create } from 'zustand';
import { LiveRoom, MiniProfile, Seat } from '../api/types';

export type LiveConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

interface LiveRoomState {
  room: LiveRoom | null;
  host: MiniProfile | null;
  viewers: number;
  likes: number;
  seats: Seat[];
  isHost: boolean;
  connectionStatus: LiveConnectionState;
  isMuted: boolean;
  isVideoMuted: boolean;
  isLiveEnded: boolean;
  endSummary: any | null;
  localVideoTrack: any | null;
  facingMode: 'user' | 'environment';

  // Actions
  setRoomData: (data: {
    room: LiveRoom;
    host: MiniProfile;
    seats?: Seat[];
    isHost?: boolean;
    viewers?: number;
  }) => void;
  updateViewers: (viewers: number) => void;
  incrementLikes: (delta?: number) => void;
  setConnectionStatus: (status: LiveConnectionState) => void;
  toggleAudioMute: () => void;
  toggleVideoMute: () => void;
  setLocalVideoTrack: (track: any | null) => void;
  setFacingMode: (mode: 'user' | 'environment') => void;
  setLiveEnded: (summary?: any) => void;
  resetRoom: () => void;
}

export const useLiveRoomStore = create<LiveRoomState>((set) => ({
  room: null,
  host: null,
  viewers: 1,
  likes: 0,
  seats: [],
  isHost: false,
  connectionStatus: 'idle',
  isMuted: false,
  isVideoMuted: false,
  isLiveEnded: false,
  endSummary: null,
  localVideoTrack: null,
  facingMode: 'user',

  setRoomData: ({ room, host, seats = [], isHost = false, viewers }) =>
    set({
      room,
      host,
      seats,
      isHost,
      viewers: viewers !== undefined ? viewers : room.viewer_count || 1,
      likes: room.likes || 0,
      isLiveEnded: false,
      endSummary: null,
    }),

  updateViewers: (viewers) => set({ viewers }),

  incrementLikes: (delta = 1) =>
    set((state) => ({ likes: state.likes + delta })),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  toggleAudioMute: () => set((state) => ({ isMuted: !state.isMuted })),

  toggleVideoMute: () => set((state) => ({ isVideoMuted: !state.isVideoMuted })),

  setLocalVideoTrack: (track) => set({ localVideoTrack: track }),

  setFacingMode: (mode) => set({ facingMode: mode }),

  setLiveEnded: (summary) =>
    set({
      isLiveEnded: true,
      endSummary: summary || null,
      connectionStatus: 'disconnected',
    }),

  resetRoom: () =>
    set({
      room: null,
      host: null,
      viewers: 1,
      likes: 0,
      seats: [],
      isHost: false,
      connectionStatus: 'idle',
      isMuted: false,
      isVideoMuted: false,
      isLiveEnded: false,
      endSummary: null,
    }),
}));

