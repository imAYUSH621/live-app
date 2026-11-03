// TypeScript definitions strictly mapped from server/src/schema.sql and routes

export interface MiniProfile {
  id: number;
  uid: number;
  fancy_id?: string | null;
  name: string;
  avatar_url?: string | null;
  gender?: 'male' | 'female' | 'other';
  country?: string;
  is_host: boolean;
  call_rate: number;
  call_enabled: boolean;
  vip_level: number;
  wealth_level: number;
  charm_level: number;
  family_id?: number | null;
  family_name?: string | null;
  family_badge?: string | null;
}

export interface UserProgress {
  level: number;
  title: string;
  badge: string;
  current: number;
  next: number;
  pct: number;
}

export interface UserItem {
  id: number;
  item_id: number;
  type: 'mount' | 'bubble' | 'frame' | 'entry' | 'badge';
  name: string;
  preview: string;
  anim_url?: string | null;
  equipped: boolean;
  expires_at?: string | null;
}

export interface User extends MiniProfile {
  email?: string | null;
  phone?: string | null;
  bio?: string | null;
  dob?: string | null;
  coins: number;
  diamonds: number;
  vip_expires?: string | null;
  noble_level: number;
  noble_expires?: string | null;
  checkin_streak: number;
  first_recharge_done: boolean;
  referral_code: string;
  status: 'active' | 'suspended' | 'banned' | 'deleted';
  created_at: string;
  uid_display: string | number;
  level_progress: UserProgress;
  charm_progress: UserProgress;
  counts: {
    followers: number;
    following: number;
    friends: number;
    visitors: number;
  };
  items: UserItem[];
  family?: {
    id: number;
    name: string;
    badge?: string | null;
  } | null;
  cp?: {
    user: MiniProfile;
    since: string;
  } | null;
  cp_requests?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LiveRoom {
  id: number;
  uid: number;
  host_id: number;
  title: string;
  category: string;
  cover_url?: string | null;
  livekit_room: string;
  status: 'active' | 'paused' | 'ended';
  viewer_count: number;
  peak_viewers: number;
  total_views: number;
  likes: number;
  diamonds_earned: number;
  coins_spent: number;
  mode: 'live' | 'party' | 'audio';
  seat_count: number;
  seats?: Seat[];
  host?: MiniProfile;
  started_at: string;
}

export interface Seat {
  index: number;
  user_id?: number | null;
  user?: MiniProfile | null;
  muted?: boolean;
  video_muted?: boolean;
}

export interface LiveJoinResponse {
  room: LiveRoom;
  token: string;
  livekit_url: string;
  host: MiniProfile;
  seats: Seat[];
  pk?: any;
}

export interface Gift {
  id: number;
  name: string;
  icon: string;
  anim_type: 'css' | 'svga' | 'lottie' | 'mp4';
  anim_url: string;
  price: number;
  category: 'normal' | 'luxury' | 'vip' | 'lucky' | 'event';
  vip_level: number;
}

export interface RechargePackage {
  id: number;
  coins: number;
  bonus: number;
  price: number;
  currency: string;
  first_bonus: number;
  product_id?: string | null;
}

export interface CallRecord {
  id: number;
  caller_id: number;
  host_id: number;
  kind: 'video' | 'audio';
  mode: 'direct' | 'random';
  rate: number;
  duration: number;
  coins_spent: number;
  diamonds_earned: number;
  status: 'ringing' | 'active' | 'completed' | 'rejected' | 'missed' | 'cancelled';
  created_at: string;
  caller?: MiniProfile;
  host?: MiniProfile;
}

export interface Moment {
  id: number;
  user_id: number;
  body: string;
  media_url?: string | null;
  media_type?: 'image' | 'video' | null;
  likes: number;
  comments: number;
  gifts_coins: number;
  liked: boolean;
  user: MiniProfile;
  created_at: string;
}

export interface Banner {
  id: number;
  title: string;
  image_url: string;
  color?: string | null;
  link?: string | null;
}

export interface PublicConfig {
  app_name: string;
  default_country: string;
  maintenance: boolean;
  min_version: string;
  features: {
    guest_login: boolean;
    phone_login: boolean;
    google_login: boolean;
    email_login: boolean;
    calls: boolean;
    random_match: boolean;
    moments: boolean;
    family: boolean;
    store: boolean;
    lucky_gift: boolean;
  };
}

