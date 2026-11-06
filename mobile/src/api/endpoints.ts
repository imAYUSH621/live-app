import { api } from './client';
import {
  AuthResponse,
  User,
  PublicConfig,
  LiveRoom,
  LiveJoinResponse,
  Gift,
  RechargePackage,
  Moment,
  CallRecord,
} from './types';

export const authApi = {
  sendOtp: (phone: string) =>
    api.post<{ ok: boolean; dev_code?: string }>('/auth/otp/send', { phone }),

  verifyOtp: (data: { phone: string; code: string; device_id: string; referral_code?: string }) =>
    api.post<AuthResponse>('/auth/otp/verify', data),

  googleLogin: (data: { id_token: string; device_id: string; referral_code?: string }) =>
    api.post<AuthResponse>('/auth/google', data),

  guestLogin: (data: { device_id: string; referral_code?: string }) =>
    api.post<AuthResponse>('/auth/guest', data),

  emailLogin: (data: { email: string; password: string; device_id: string }) =>
    api.post<AuthResponse>('/auth/login', data),
};

export const userApi = {
  getMe: () => api.get<User>('/me'),

  updateMe: (data: Partial<User>) => api.patch<User>('/me', data),

  updateFcmToken: (token: string) => api.post<{ ok: boolean }>('/me/fcm', { token }),

  uploadAvatar: (formData: FormData) =>
    api.upload<{ avatar_url: string }>('/me/avatar', formData),

  getLedger: (currency = 'coin', page = 1) =>
    api.get<any[]>(`/me/ledger?currency=${currency}&page=${page}`),
};

export const discoverApi = {
  getConfig: () => api.get<PublicConfig>('/config'),

  getHome: () =>
    api.get<{
      banners: any[];
      events: any[];
      categories: string[];
      rooms: LiveRoom[];
      top_hosts: any[];
    }>('/home'),

  getRankings: (type = 'wealth', period = 'daily') =>
    api.get<any[]>(`/rankings?type=${type}&period=${period}`),
};

export const liveApi = {
  getRooms: (category?: string, tab = 'all') =>
    api.get<LiveRoom[]>(`/rooms?tab=${tab}${category ? `&category=${category}` : ''}`),

  createRoom: (data: { title: string; category: string; mode?: string; cover_url?: string }) =>
    api.post<LiveJoinResponse>('/rooms', data),

  joinRoom: (id: number, ticketCode?: string) =>
    api.post<LiveJoinResponse>(`/rooms/${id}/join`, { ticket_code: ticketCode }),

  leaveRoom: (id: number) => api.post<{ ok: boolean }>(`/rooms/${id}/leave`),

  endRoom: (id: number) => api.post<{ ok: boolean; summary?: any }>(`/rooms/${id}/end`),
};

export const walletApi = {
  getWallet: () =>
    api.get<{
      coins: number;
      diamonds: number;
      diamonds_per_unit: number;
      currency: string;
      exchange_rate: number;
      min_exchange: number;
    }>('/wallet'),

  getGifts: () => api.get<Gift[]>('/gifts'),

  sendGift: (data: {
    receiver_id: number;
    gift_id: number;
    qty?: number;
    context?: 'room' | 'call' | 'chat' | 'moment';
    room_id?: number;
    call_id?: number;
  }) => api.post<any>('/gifts/send', data),

  getRechargePackages: (platform = 'android') =>
    api.get<{
      packages: RechargePackage[];
      first_recharge: boolean;
      gateway: string | null;
      razorpay_key: string | null;
      banners: any[];
    }>(`/recharge/packages?platform=${platform}`),

  createRechargeOrder: (package_id: number) =>
    api.post<any>('/recharge/order', { package_id }),

  verifyRechargeOrder: (order_id: number, razorpay_payment_id: string, razorpay_signature: string) =>
    api.post<{ ok: boolean; credited: number; coins: number }>('/recharge/verify', {
      order_id,
      razorpay_payment_id,
      razorpay_signature,
    }),

  exchangeDiamonds: (diamonds: number) =>
    api.post<{ diamonds: number; coins: number }>('/wallet/exchange', { diamonds }),

  getRechargeOrders: () =>
    api.get<any[]>('/recharge/orders'),
};

export const storeApi = {
  getVip: () => api.get<{ levels: any[]; current: number; expires: string | null }>('/vip'),

  buyVip: (level: number) => api.post<User>('/vip/buy', { level }),

  getNoble: () => api.get<{ ranks: any[]; current: number; expires: string | null }>('/noble'),

  buyNoble: (rank: number) => api.post<User>('/noble/buy', { rank }),

  getStoreItems: (type?: string) =>
    api.get<any[]>(`/store${type ? `?type=${type}` : ''}`),

  buyStoreItem: (item_id: number, to_user_id?: number) =>
    api.post<User>('/store/buy', { item_id, to_user_id }),

  equipStoreItem: (user_item_id: number, equip = true) =>
    api.post<User>('/store/equip', { user_item_id, equip }),

  getFancyIds: () => api.get<any[]>('/fancy-ids'),

  buyFancyId: (fancy_id_id: number) =>
    api.post<User>('/fancy-ids/buy', { fancy_id_id }),
};

export const callsApi = {
  getIceServers: () => api.get<{ iceServers: RTCIceServer[] }>('/calls/ice'),

  initiateCall: (data: { host_id: number; kind: 'video' | 'audio' }) =>
    api.post<{ call: CallRecord; host: any; iceServers: RTCIceServer[] }>('/calls', data),

  randomMatch: (data: { gender?: 'male' | 'female'; kind: 'video' | 'audio' }) =>
    api.post<{ call: CallRecord; host: any; iceServers: RTCIceServer[] }>('/calls/random', data),

  acceptCall: (id: number) => api.post<CallRecord>(`/calls/${id}/accept`),

  rejectCall: (id: number) => api.post<{ ok: boolean }>(`/calls/${id}/reject`),

  endCall: (id: number) => api.post<{ ok: boolean }>(`/calls/${id}/end`),

  rateCall: (id: number, rating: number, tags?: string[]) =>
    api.post<{ ok: boolean }>(`/calls/${id}/rate`, { rating, tags }),
};

export const pkApi = {
  getCandidates: () => api.get<any[]>('/pk/candidates'),

  invite: (target_room_id: number) =>
    api.post<{ pk_id: number }>('/pk/invite', { target_room_id }),

  random: () => api.post<{ matched: boolean; pk?: any }>('/pk/random'),

  cancelRandom: () => api.post<{ ok: boolean }>('/pk/random/cancel'),

  accept: (pkId: number) => api.post<any>(`/pk/${pkId}/accept`),

  decline: (pkId: number) => api.post<{ ok: boolean }>(`/pk/${pkId}/decline`),

  quit: (pkId: number) => api.post<{ ok: boolean }>(`/pk/${pkId}/quit`),

  getInfo: (pkId: number) => api.get<any>(`/pk/${pkId}`),
};

export const rewardsApi = {
  getCheckin: () => api.get<{ streak: number; checked_in_today: boolean; days: any[] }>('/checkin'),
  doCheckin: () => api.post<{ ok: boolean; reward: number; streak: number }>('/checkin'),
  getSpin: () => api.get<{ free_spins: number; cost: number; slices: any[] }>('/spin'),
  doSpin: () => api.post<{ ok: boolean; reward_type: string; reward_amount: number; slice_index: number }>('/spin'),
  getTasks: () => api.get<{ daily: any[]; growth: any[] }>('/tasks'),
  claimTask: (key: string) => api.post<{ ok: boolean; coins: number }>(`/tasks/${key}/claim`),
  getAdsStatus: () => api.get<{ can_watch: boolean; remaining_today: number; reward_coins: number }>('/ads/status'),
  rewardAd: () => api.post<{ ok: boolean; coins_rewarded: number }>('/ads/reward'),
  getReferral: () => api.get<{ code: string; invited_count: number; total_earned: number }>('/referral'),
};

export const momentsApi = {
  getMoments: (tab = 'latest', limit = 20, offset = 0) =>
    api.get<any[]>(`/moments?tab=${tab}&limit=${limit}&offset=${offset}`),
  createMoment: (body: string, mediaUri?: string) => {
    if (!mediaUri) {
      return api.post<any>('/moments', { body });
    }
    const form = new FormData();
    if (body) form.append('body', body);
    form.append('media', {
      uri: mediaUri,
      name: 'moment_media.jpg',
      type: 'image/jpeg',
    } as any);
    return api.post<any>('/moments', form);
  },
  deleteMoment: (id: number) => api.delete<{ ok: boolean }>(`/moments/${id}`),
  likeMoment: (id: number) => api.post<{ liked: boolean; likes: number }>(`/moments/${id}/like`),
  getComments: (id: number) => api.get<any[]>(`/moments/${id}/comments`),
  postComment: (id: number, text: string) => api.post<any>(`/moments/${id}/comments`, { text }),
};

export const socialApi = {
  getChats: () => api.get<any[]>('/chats'),
  getChatMessages: (userId: number) => api.get<{ user: any; messages: any[] }>(`/chats/${userId}`),
  sendChatMessage: (userId: number, text: string) => api.post<any>(`/chats/${userId}`, { body: text }),
  getFamilies: () => api.get<any[]>('/families'),
  getFamily: (id: number) => api.get<any>(`/families/${id}`),
  joinFamily: (id: number) => api.post<{ status: string; ok?: boolean }>(`/families/${id}/join`),
  leaveFamily: () => api.post<{ ok: boolean }>('/families/leave'),
  getFamilyMessages: (id: number) => api.get<any[]>(`/families/${id}/messages`),
  sendFamilyMessage: (id: number, text: string) => api.post<any>(`/families/${id}/messages`, { text }),
};

export const bondsApi = {
  proposeCp: (targetUserId: number) => api.post<any>('/cp/propose', { target_user_id: targetUserId }),
  getCpRequests: () => api.get<any[]>('/cp/requests'),
  respondCpRequest: (requestId: number, accept: boolean) =>
    api.post<any>(`/cp/requests/${requestId}`, { action: accept ? 'accept' : 'reject' }),
  breakupCp: () => api.delete<{ ok: boolean }>('/cp'),
  getFanClub: (hostId: number) => api.get<any>(`/fan-club/${hostId}`),
  joinFanClub: (hostId: number) => api.post<any>(`/fan-club/${hostId}/join`),
  getMyFanClubs: () => api.get<any[]>('/fan-clubs/mine'),
};

export const hostCenterApi = {
  getHostCenter: () => api.get<any>('/host/center'),
  getHostIncome: () => api.get<any>('/host/income'),
  getHostFans: () => api.get<any[]>('/host/fans'),
  applyHost: (formData: FormData) => api.post<any>('/host/apply', formData),
};

export interface SafetyState {
  dailyLimit: number;
  spentToday: number;
  pendingLimit: number | null;
  pendingAt: string | null;
  refundWindowHours: number;
  orders: Array<{
    id: number;
    coins: number;
    amount: number;
    currency: string;
    at: string;
    status: string;
    refundStatus: string | null;
    canRefund: boolean;
  }>;
}

export interface SupportTicket {
  id: number;
  subject: string;
  status: string;
  reply: string | null;
  created_at: string;
}

export const safetyApi = {
  getSafety: () => api.get<SafetyState>('/safety'),

  setDailyLimit: (coins: number) =>
    api.put<{ dailyLimit: number; pendingLimit: number | null }>('/safety/limit', { coins }),

  requestRefund: (orderId: number) =>
    api.post<{ ok: boolean }>(`/recharge/${orderId}/refund`, {}),
};

export const supportApi = {
  listTickets: () => api.get<SupportTicket[]>('/support'),

  createTicket: (subject: string, body: string) =>
    api.post<{ ok: boolean }>('/support', { subject, body }),
};

export interface AgencyInvite {
  id: number;
  name: string;
  code: string;
}

export const agencyApi = {
  myInvites: () => api.get<AgencyInvite[]>('/agency/invites'),

  joinByCode: (code: string) => api.post<any>('/agency/join', { code }),

  answerInvite: (id: number, action: 'accept' | 'decline') =>
    api.post<any>(`/agency/invites/${id}/${action}`, {}),

  leaveAgency: () => api.post<any>('/host/leave-agency', {}),
};
