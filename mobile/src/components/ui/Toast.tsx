import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, typography, radii, spacing } from '../../theme';

interface ToastProps {
  message?: string | null;
  type?: 'success' | 'error' | 'info' | 'gold';
  visible?: boolean;
  onHide?: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'gold',
  visible,
  onHide,
  duration = 3000,
}) => {
  const isVisible = visible !== undefined ? visible : Boolean(message);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -20,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (onHide) onHide();
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isVisible || !message) return null;

  const getBorderColor = () => {
    switch (type) {
      case 'error':
        return colors.feedback.error;
      case 'success':
        return colors.feedback.success;
      case 'info':
        return colors.feedback.info;
      default:
        return colors.gold.primary;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity, transform: [{ translateY }], borderColor: getBorderColor() },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    backgroundColor: 'rgba(14, 19, 34, 0.95)',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    color: colors.text.primary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    textAlign: 'center',
  },
});

