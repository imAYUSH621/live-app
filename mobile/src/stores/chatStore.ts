import { create } from 'zustand';
import { MiniProfile } from '../api/types';

export interface ChatMessage {
  id: string;
  type: 'chat' | 'enter' | 'gift' | 'system';
  user: MiniProfile;
  text?: string;
  giftName?: string;
  giftIcon?: string;
  giftQty?: number;
  ts: number;
}

const MAX_MESSAGES = 200;
let incomingBatch: ChatMessage[] = [];
let batchTimeout: NodeJS.Timeout | null = null;

interface ChatState {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],

  addMessage: (msg: ChatMessage) => {
    incomingBatch.push(msg);

    if (!batchTimeout) {
      batchTimeout = setTimeout(() => {
        set((state) => {
          const combined = [...state.messages, ...incomingBatch];
          incomingBatch = [];
          batchTimeout = null;

          if (combined.length > MAX_MESSAGES) {
            return { messages: combined.slice(combined.length - MAX_MESSAGES) };
          }
          return { messages: combined };
        });
      }, 120);
    }
  },

  clearMessages: () => {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
    incomingBatch = [];
    set({ messages: [] });
  },
}));

