import { create } from 'zustand';
import { MiniProfile } from '../api/types';

export type PKStatus = 'idle' | 'invited' | 'active' | 'punishment' | 'ended';

interface PKBattleState {
  pkId: number | null;
  status: PKStatus;
  hostScore: number;
  opponentScore: number;
  remainingSeconds: number;
  endsAt: string | null;
  opponent: MiniProfile | null;
  winnerId: number | null;

  // Actions
  startPk: (data: {
    pkId: number;
    opponent: MiniProfile;
    duration?: number;
    endsAt?: string;
  }) => void;
  updateScores: (hostScore: number, opponentScore: number) => void;
  decrementTimer: () => void;
  endPk: (winnerId: number | null) => void;
  resetPk: () => void;
}

export const usePkBattleStore = create<PKBattleState>((set) => ({
  pkId: null,
  status: 'idle',
  hostScore: 0,
  opponentScore: 0,
  remainingSeconds: 300,
  endsAt: null,
  opponent: null,
  winnerId: null,

  startPk: ({ pkId, opponent, duration = 300, endsAt }) =>
    set({
      pkId,
      status: 'active',
      opponent,
      hostScore: 0,
      opponentScore: 0,
      remainingSeconds: duration,
      endsAt: endsAt || null,
      winnerId: null,
    }),

  updateScores: (hostScore, opponentScore) =>
    set({ hostScore, opponentScore }),

  decrementTimer: () =>
    set((state) => ({
      remainingSeconds: Math.max(0, state.remainingSeconds - 1),
    })),

  endPk: (winnerId) =>
    set({
      status: 'ended',
      winnerId,
    }),

  resetPk: () =>
    set({
      pkId: null,
      status: 'idle',
      hostScore: 0,
      opponentScore: 0,
      remainingSeconds: 300,
      endsAt: null,
      opponent: null,
      winnerId: null,
    }),
}));

