import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useGiftQueueStore } from '../../stores/giftQueueStore';
import { colors, typography, radii, spacing } from '../../theme';
import { resolveUrl } from '../../api/client';

export const GlobalGiftBanner: React.FC = () => {
  const globalBanner = useGiftQueueStore((s) => s.globalBanner);
  const setGlobalBanner = useGiftQueueStore((s) => s.setGlobalBanner);

  const translateX = useRef(new Animated.Value(-350)).current;

  useEffect(() => {
    if (!globalBanner) return;

    Animated.sequence([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.delay(3500),
      Animated.timing(translateX, {
        toValue: 400,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setGlobalBanner(null);
      translateX.setValue(-350);
    });
  }, [globalBanner]);

  if (!globalBanner) return null;

  const iconUrl = resolveUrl(globalBanner.gift.icon);

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={[
          styles.bannerCard,
          { transform: [{ translateX }] },
        ]}
      >
        <Image source={{ uri: iconUrl }} style={styles.icon} contentFit="contain" />
        <Text style={styles.text} numberOfLines={1}>
          <Text style={styles.highlight}>{globalBanner.from.name}</Text> sent{' '}
          <Text style={styles.giftName}>{globalBanner.gift.name}</Text> to{' '}
          <Text style={styles.highlight}>{globalBanner.to.name}</Text>
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 45,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 19, 34, 0.94)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
    shadowColor: colors.gold.bright,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    width: 28,
    height: 28,
    marginRight: spacing.sm,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    flex: 1,
  },
  highlight: {
    color: colors.gold.light,
    fontWeight: typography.weights.bold,
  },
  giftName: {
    color: '#F472B6',
    fontWeight: typography.weights.bold,
  },
});

