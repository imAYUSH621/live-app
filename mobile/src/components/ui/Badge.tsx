import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, radii, spacing } from '../../theme';

interface BadgeProps {
  type?: 'wealth' | 'charm' | 'vip' | 'noble' | 'host';
  level?: number;
  label?: string;
  variant?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  type = 'noble',
  level = 1,
  label,
  variant,
  size = 'sm',
  style,
}) => {
  const getGradientColors = (): readonly [string, string, ...string[]] => {
    switch (type) {
      case 'wealth':
        return ['#F59E0B', '#D97706'];
      case 'charm':
        return ['#EC4899', '#DB2777'];
      case 'vip':
        return ['#8B5CF6', '#6D28D9'];
      case 'noble':
        return ['#FFE599', '#D4AF37', '#9A7B1C'];
      case 'host':
        return ['#3B82F6', '#1D4ED8'];
      default:
        return ['#64748B', '#475569'];
    }
  };

  const getPrefix = (): string => {
    if (label) return label;
    switch (type) {
      case 'wealth':
        return `Lv.${level}`;
      case 'charm':
        return `★${level}`;
      case 'vip':
        return `VIP ${level}`;
      case 'noble':
        return 'NOBLE';
      case 'host':
        return 'HOST';
      default:
        return `${level}`;
    }
  };

  const isSmall = size === 'sm';

  return (
    <View style={[styles.wrapper, style]}>
      <LinearGradient
        colors={getGradientColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.container,
          isSmall ? styles.containerSm : styles.containerMd,
        ]}
      >
        <Text
          style={[
            styles.text,
            isSmall ? styles.textSm : styles.textMd,
            type === 'noble' && styles.nobleText,
          ]}
        >
          {getPrefix()}
        </Text>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerSm: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1.5,
    borderRadius: radii.full,
  },
  containerMd: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
  },
  textSm: {
    fontSize: 9,
    letterSpacing: 0.3,
  },
  textMd: {
    fontSize: typography.sizes.xs,
    letterSpacing: 0.4,
  },
  nobleText: {
    color: '#07090E',
  },
});

