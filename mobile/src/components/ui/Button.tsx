import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, typography, radii, spacing } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'gold' | 'outline' | 'surface' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'gold',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
}) => {
  const handlePress = () => {
    if (disabled || loading) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  const isGold = variant === 'gold';

  const containerSizes: Record<string, ViewStyle> = {
    sm: { paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md, borderRadius: radii.full },
    md: { paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.lg, borderRadius: radii.full },
    lg: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl, borderRadius: radii.full },
  };

  const textSizes: Record<string, TextStyle> = {
    sm: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
    md: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
    lg: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  };

  const content = (
    <View style={styles.innerContent}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isGold ? colors.text.inverse : colors.gold.light}
        />
      ) : (
        <>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <Text
            style={[
              styles.text,
              textSizes[size],
              isGold && styles.goldText,
              variant === 'outline' && styles.outlineText,
              variant === 'surface' && styles.surfaceText,
              variant === 'ghost' && styles.ghostText,
              variant === 'danger' && styles.dangerText,
              disabled && styles.disabledText,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </View>
  );

  if (isGold && !disabled) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        disabled={disabled || loading}
        style={[styles.baseButton, containerSizes[size], style]}
      >
        <LinearGradient
          colors={['#FFE599', '#D4AF37', '#B38B1B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: containerSizes[size].borderRadius }]}
        />
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        styles.baseButton,
        containerSizes[size],
        variant === 'outline' && styles.outlineButton,
        variant === 'surface' && styles.surfaceButton,
        variant === 'ghost' && styles.ghostButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
        style,
      ]}
    >
      {content}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  innerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: spacing.xs + 2,
  },
  text: {
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  goldText: {
    color: '#07090E',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
  },
  outlineText: {
    color: colors.gold.light,
  },
  surfaceButton: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  surfaceText: {
    color: colors.text.primary,
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: colors.text.secondary,
  },
  dangerButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  dangerText: {
    color: colors.text.danger,
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'transparent',
  },
  disabledText: {
    color: colors.text.muted,
  },
});

