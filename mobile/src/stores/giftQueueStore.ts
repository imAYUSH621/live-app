import { create } from 'zustand';
import { Gift, MiniProfile } from '../api/types';

export interface GiftAnimationItem {
  id: string | number;
  gift: Gift;
  from: MiniProfile;
  to: MiniProfile;
  qty: number;
  combo?: number;
  coins: number;
}

interface GiftQueueState {
  queue: GiftAnimationItem[];
  currentAnimation: GiftAnimationItem | null;
  globalBanner: GiftAnimationItem | null;

  // Actions
  enqueueGift: (item: GiftAnimationItem) => void;
  nextAnimation: () => void;
  setGlobalBanner: (item: GiftAnimationItem | null) => void;
  clearQueue: () => void;
}

export const useGiftQueueStore = create<GiftQueueState>((set, get) => ({
  queue: [],
  currentAnimation: null,
  globalBanner: null,

  enqueueGift: (item: GiftAnimationItem) => {
    const current = get().currentAnimation;

    // Load management: If queue is large (> 5 items), drop small gifts (< 200 coins)
    if (get().queue.length > 5 && item.coins < 200) {
      return;
    }

    if (!current) {
      set({ currentAnimation: item });
    } else {
      set((state) => ({ queue: [...state.queue, item] }));
    }
  },

  nextAnimation: () => {
    const next = get().queue[0] || null;
    const remaining = get().queue.slice(1);
    set({
      currentAnimation: next,
      queue: remaining,
    });
  },

  setGlobalBanner: (item: GiftAnimationItem | null) => {
    set({ globalBanner: item });
  },

  clearQueue: () => {
    set({ queue: [], currentAnimation: null, globalBanner: null });
  },
}));

