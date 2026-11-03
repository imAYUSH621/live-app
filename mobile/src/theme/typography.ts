import { TextStyle } from 'react-native';

export const typography = {
  fonts: {
    heading: 'System', // Falls back smoothly to system serif or Playfair if loaded
    body: 'System',
    mono: 'Courier',
  },
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    display: 32,
    giant: 40,
  },
  weights: {
    regular: '400' as TextStyle['fontWeight'],
    medium: '500' as TextStyle['fontWeight'],
    semibold: '600' as TextStyle['fontWeight'],
    bold: '700' as TextStyle['fontWeight'],
    heavy: '800' as TextStyle['fontWeight'],
  },
  lineHeights: {
    xs: 15,
    sm: 18,
    md: 22,
    lg: 24,
    xl: 28,
    xxl: 32,
    display: 40,
  },
} as const;

export type Typography = typeof typography;

