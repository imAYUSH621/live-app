import { create } from 'zustand';
import { CallRecord, MiniProfile } from '../api/types';

export type CallStatus =
  | 'idle'
  | 'outgoing_ringing'
  | 'incoming_ringing'
  | 'connected'
  | 'ended';

interface CallState {
  callId: number | null;
  status: CallStatus;
  role: 'caller' | 'host' | null;
  peer: MiniProfile | null;
  kind: 'video' | 'audio';
  rate: number;
  durationSeconds: number;
  coinsSpent: number;
  isMuted: boolean;
  isVideoMuted: boolean;
  isSpeaker: boolean;
  endReason?: string;

  // Actions
  setOutgoingCall: (data: {
    callId: number;
    peer: MiniProfile;
    kind: 'video' | 'audio';
    rate: number;
  }) => void;
  setIncomingCall: (data: {
    callId: number;
    from: MiniProfile;
    kind: 'video' | 'audio';
    rate: number;
  }) => void;
  setConnected: () => void;
  tickDuration: () => void;
  toggleMute: () => void;
  toggleVideoMute: () => void;
  toggleSpeaker: () => void;
  endCall: (reason?: string) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  callId: null,
  status: 'idle',
  role: null,
  peer: null,
  kind: 'video',
  rate: 0,
  durationSeconds: 0,
  coinsSpent: 0,
  isMuted: false,
  isVideoMuted: false,
  isSpeaker: true,

  setOutgoingCall: ({ callId, peer, kind, rate }) =>
    set({
      callId,
      status: 'outgoing_ringing',
      role: 'caller',
      peer,
      kind,
      rate,
      durationSeconds: 0,
      coinsSpent: rate, // 1st minute paid upfront
      isMuted: false,
      isVideoMuted: false,
      isSpeaker: true,
      endReason: undefined,
    }),

  setIncomingCall: ({ callId, from, kind, rate }) =>
    set({
      callId,
      status: 'incoming_ringing',
      role: 'host',
      peer: from,
      kind,
      rate,
      durationSeconds: 0,
      coinsSpent: 0,
      isMuted: false,
      isVideoMuted: false,
      isSpeaker: true,
      endReason: undefined,
    }),

  setConnected: () =>
    set({
      status: 'connected',
    }),

  tickDuration: () =>
    set((state) => {
      const nextSeconds = state.durationSeconds + 1;
      const minutes = Math.ceil(nextSeconds / 60);
      const spent = state.role === 'caller' ? minutes * state.rate : 0;
      return {
        durationSeconds: nextSeconds,
        coinsSpent: spent,
      };
    }),

  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  toggleVideoMute: () => set((state) => ({ isVideoMuted: !state.isVideoMuted })),

  toggleSpeaker: () => set((state) => ({ isSpeaker: !state.isSpeaker })),

  endCall: (reason = 'hangup') =>
    set({
      status: 'ended',
      endReason: reason,
    }),

  resetCall: () =>
    set({
      callId: null,
      status: 'idle',
      role: null,
      peer: null,
      kind: 'video',
      rate: 0,
      durationSeconds: 0,
      coinsSpent: 0,
      isMuted: false,
      isVideoMuted: false,
      isSpeaker: true,
      endReason: undefined,
    }),
}));

