import { create } from 'zustand';
import { User } from '../api/types';
import { getSecureToken, setSecureToken, removeSecureToken } from '../utils/secureStorage';
import { getDeviceId } from '../utils/device';
import { userApi } from '../api/endpoints';

interface AuthState {
  user: User | null;
  token: string | null;
  deviceId: string | null;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  setAuth: (token: string, user: User) => Promise<void>;
  setUser: (user: User) => void;
  updateUser: (patch: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  deviceId: null,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    try {
      const [token, deviceId] = await Promise.all([
        getSecureToken(),
        getDeviceId(),
      ]);

      if (!token) {
        set({ token: null, user: null, deviceId, isLoading: false, isInitialized: true });
        return;
      }

      set({ token, deviceId });

      try {
        const user = await userApi.getMe();
        set({ user, isLoading: false, isInitialized: true });
      } catch (err: any) {
        console.warn('[AuthStore] Failed to fetch current user', err?.message);
        if (err?.status === 401 || err?.code === 'unauthorized') {
          await removeSecureToken();
          set({ token: null, user: null, isLoading: false, isInitialized: true });
        } else {
          set({ isLoading: false, isInitialized: true });
        }
      }
    } catch (e) {
      console.error('[AuthStore] Init error', e);
      set({ isLoading: false, isInitialized: true });
    }
  },

  setAuth: async (token: string, user: User) => {
    await setSecureToken(token);
    set({ token, user, isLoading: false });
  },

  setUser: (user: User) => {
    set({ user });
  },

  updateUser: (patch: Partial<User>) => {
    const current = get().user;
    if (current) {
      set({ user: { ...current, ...patch } });
    }
  },

  refreshUser: async () => {
    try {
      const user = await userApi.getMe();
      set({ user });
    } catch (e) {
      console.warn('[AuthStore] Refresh user failed', e);
    }
  },

  logout: async () => {
    await removeSecureToken();
    set({ token: null, user: null, isLoading: false });
  },
}));

