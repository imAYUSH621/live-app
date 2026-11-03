import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { usePkBattleStore } from '../../stores/pkBattleStore';
import { colors, typography, radii, spacing } from '../../theme';
import { formatNumber, formatDuration } from '../../utils/formatters';

export const PKScoreBar: React.FC = () => {
  const {
    status,
    hostScore,
    opponentScore,
    remainingSeconds,
    opponent,
    decrementTimer,
  } = usePkBattleStore();

  const total = hostScore + opponentScore;
  const hostPct = total === 0 ? 50 : Math.max(15, Math.min(85, (hostScore / total) * 100));

  const widthAnim = useRef(new Animated.Value(50)).current;

  // Animate width transition when scores change
  useEffect(() => {
    Animated.spring(widthAnim, {
      toValue: hostPct,
      friction: 6,
      tension: 40,
      useNativeDriver: false,
    }).start();
  }, [hostPct]);

  // Countdown timer effect
  useEffect(() => {
    if (status !== 'active') return;
    const interval = setInterval(() => {
      decrementTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (status !== 'active' && status !== 'punishment') return null;

  return (
    <View style={styles.container}>
      {/* Top Details (Opponent Name & Timer) */}
      <View style={styles.topInfo}>
        <Text style={styles.hostLabel}>Host</Text>
        <View style={styles.timerBadge}>
          <Text style={styles.timerText}>
            ⏱ {formatDuration(remainingSeconds)}
          </Text>
        </View>
        <Text style={styles.opponentLabel} numberOfLines={1}>
          {opponent?.name || 'Challenger'}
        </Text>
      </View>

      {/* Split Score Bar */}
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.hostBar,
            { width: widthAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              })
            },
          ]}
        >
          <Text style={styles.scoreTextLeft}>{formatNumber(hostScore)}</Text>
        </Animated.View>

        <View style={styles.opponentBar}>
          <Text style={styles.scoreTextRight}>
            {formatNumber(opponentScore)}
          </Text>
        </View>

        {/* Center VS Emblem */}
        <View style={styles.vsBadge}>
          <Text style={styles.vsText}>VS</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    marginVertical: spacing.xs,
    zIndex: 20,
  },
  topInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  hostLabel: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: typography.weights.bold,
  },
  timerBadge: {
    backgroundColor: 'rgba(7, 9, 14, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.gold.primary,
  },
  timerText: {
    color: colors.gold.bright,
    fontSize: 10,
    fontWeight: typography.weights.heavy,
  },
  opponentLabel: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: typography.weights.bold,
    maxWidth: 90,
  },
  barTrack: {
    height: 22,
    backgroundColor: '#EF4444',
    borderRadius: radii.full,
    overflow: 'hidden',
    position: 'relative',
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  hostBar: {
    height: '100%',
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    paddingLeft: spacing.sm,
  },
  opponentBar: {
    flex: 1,
    height: '100%',
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: spacing.sm,
  },
  scoreTextLeft: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: typography.weights.heavy,
  },
  scoreTextRight: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: typography.weights.heavy,
  },
  vsBadge: {
    position: 'absolute',
    alignSelf: 'center',
    left: '50%',
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.gold.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  vsText: {
    color: '#07090E',
    fontSize: 10,
    fontWeight: typography.weights.heavy,
  },
});

