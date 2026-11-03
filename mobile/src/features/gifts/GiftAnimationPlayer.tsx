import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useGiftQueueStore } from '../../stores/giftQueueStore';
import { colors, typography, radii, spacing } from '../../theme';
import { resolveUrl } from '../../api/client';
import { Avatar } from '../../components/ui';

export const GiftAnimationPlayer: React.FC = () => {
  const current = useGiftQueueStore((s) => s.currentAnimation);
  const nextAnimation = useGiftQueueStore((s) => s.nextAnimation);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const comboScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!current) return;

    // Trigger entrance animation
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse combo
    Animated.sequence([
      Animated.timing(comboScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
      Animated.spring(comboScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();

    // Auto dismiss after 2.2 seconds
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        scale.setValue(0.4);
        nextAnimation();
      });
    }, 2200);

    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  const iconUrl = resolveUrl(current.gift.icon);

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View
        style={[
          styles.container,
          { opacity, transform: [{ scale }] },
        ]}
      >
        {/* Sender banner */}
        <View style={styles.senderPill}>
          <Avatar
            url={current.from.avatar_url}
            name={current.from.name}
            size={34}
            vipLevel={current.from.vip_level}
          />
          <View style={styles.senderDetails}>
            <Text style={styles.senderName} numberOfLines={1}>
              {current.from.name}
            </Text>
            <Text style={styles.sentLabel}>
              sent {current.gift.name}
            </Text>
          </View>
        </View>

        {/* Big Animated 3D Gift Icon */}
        <Image
          source={{ uri: iconUrl }}
          style={styles.bigGiftImage}
          contentFit="contain"
        />

        {/* Combo Multiplier Text */}
        {current.combo && current.combo > 1 ? (
          <Animated.View
            style={[
              styles.comboBanner,
              { transform: [{ scale: comboScale }] },
            ]}
          >
            <Text style={styles.comboText}>x{current.combo}</Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 9, 14, 0.85)',
    borderRadius: radii.full,
    paddingLeft: 3,
    paddingRight: spacing.lg,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.gold.primary,
    marginBottom: spacing.md,
  },
  senderDetails: {
    marginLeft: spacing.sm,
  },
  senderName: {
    color: colors.gold.light,
    fontSize: 12,
    fontWeight: typography.weights.bold,
  },
  sentLabel: {
    color: '#FFFFFF',
    fontSize: 10,
  },
  bigGiftImage: {
    width: 180,
    height: 180,
  },
  comboBanner: {
    marginTop: spacing.xs,
    backgroundColor: 'rgba(236, 72, 153, 0.85)',
    paddingHorizontal: spacing.lg,
    paddingVertical: 3,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  comboText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: typography.weights.heavy,
    letterSpacing: 1,
  },
});

