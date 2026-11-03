export const colors = {
  background: {
    base: '#07090E',
    surface: '#0E1322',
    card: '#141B30',
    elevated: '#1C2540',
    overlay: 'rgba(7, 9, 14, 0.75)',
    modal: 'rgba(5, 7, 11, 0.88)',
  },
  gold: {
    primary: '#D4AF37',
    light: '#F5D77F',
    bright: '#FFE599',
    dark: '#9A7B1C',
    deep: '#69510C',
    gradient: ['#FFE599', '#D4AF37', '#9A7B1C'] as const,
    subtle: 'rgba(212, 175, 55, 0.12)',
    border: 'rgba(212, 175, 55, 0.35)',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#CBD5E1',
    muted: '#64748B',
    gold: '#F5D77F',
    inverse: '#07090E',
    danger: '#F87171',
    success: '#34D399',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.08)',
    medium: 'rgba(255, 255, 255, 0.16)',
    active: 'rgba(212, 175, 55, 0.6)',
  },
  status: {
    online: '#10B981',
    offline: '#6B7280',
    busy: '#EF4444',
    live: '#EC4899',
  },
  badge: {
    vip: '#8B5CF6',
    diamond: '#06B6D4',
    wealth: '#F59E0B',
    charm: '#EC4899',
    host: '#3B82F6',
  },
  feedback: {
    error: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
} as const;

export type Colors = typeof colors;

