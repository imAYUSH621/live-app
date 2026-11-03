import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, typography, radii } from '../../theme';
import { resolveUrl } from '../../api/client';

interface AvatarProps {
  url?: string | null;
  name?: string;
  size?: number;
  vipLevel?: number;
  isOnline?: boolean;
  isLive?: boolean;
  style?: ViewStyle;
}

export const Avatar: React.FC<AvatarProps> = ({
  url,
  name,
  size = 48,
  vipLevel = 0,
  isOnline = false,
  isLive = false,
  style,
}) => {
  const initial = (name || 'U').charAt(0).toUpperCase();
  const fullUrl = url ? resolveUrl(url) : null;
  const isVip = vipLevel > 0;
  const borderWidth = isVip ? 2.5 : 1;

  return (
    <View style={[{ width: size, height: size }, styles.container, style]}>
      {isVip && (
        <LinearGradient
          colors={['#FFE599', '#D4AF37', '#9A7B1C']}
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radii.full, margin: -borderWidth },
          ]}
        />
      )}

      <View
        style={[
          styles.innerRing,
          {
            width: size,
            height: size,
            borderRadius: radii.full,
            borderColor: isVip ? '#07090E' : colors.border.subtle,
            borderWidth: isVip ? 1.5 : 1,
          },
        ]}
      >
        {fullUrl ? (
          <Image
            source={{ uri: fullUrl }}
            style={{ width: '100%', height: '100%', borderRadius: radii.full }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={['#2A324B', '#141B30']}
            style={[StyleSheet.absoluteFill, styles.fallback]}
          >
            <Text
              style={[
                styles.initialText,
                { fontSize: Math.floor(size * 0.42) },
              ]}
            >
              {initial}
            </Text>
          </LinearGradient>
        )}
      </View>

      {/* Live Badge */}
      {isLive && (
        <View style={styles.liveIndicator}>
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}

      {/* Online Dot (only if not live) */}
      {!isLive && isOnline && <View style={styles.onlineDot} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  innerRing: {
    overflow: 'hidden',
    backgroundColor: colors.background.surface,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: colors.gold.light,
    fontWeight: typography.weights.bold,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: radii.full,
    backgroundColor: colors.status.online,
    borderWidth: 2,
    borderColor: colors.background.base,
  },
  liveIndicator: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: colors.status.live,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.background.base,
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: typography.weights.heavy,
    letterSpacing: 0.5,
  },
});

