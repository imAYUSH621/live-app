import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Avatar } from '../../components/ui';
import { colors, typography, radii, spacing } from '../../theme';
import { MiniProfile } from '../../api/types';
import { formatNumber } from '../../utils/formatters';

interface CallRingingViewProps {
  isIncoming: boolean;
  peer: MiniProfile | null;
  kind: 'video' | 'audio';
  rate: number;
  onAccept: () => void;
  onReject: () => void;
}

export const CallRingingView: React.FC<CallRingingViewProps> = ({
  isIncoming,
  peer,
  kind,
  rate,
  onAccept,
  onReject,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background Dark Overlay */}
      <View style={[StyleSheet.absoluteFill, styles.bgOverlay]} />

      {/* Center Avatar & Details */}
      <View style={styles.centerBox}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Avatar
            url={peer?.avatar_url}
            name={peer?.name}
            size={110}
            vipLevel={peer?.vip_level}
          />
        </Animated.View>

        <Text style={styles.peerName}>{peer?.name || 'User'}</Text>

        <Text style={styles.callTypeLabel}>
          {isIncoming
            ? `Incoming 1v1 ${kind === 'video' ? 'Video' : 'Audio'} Call`
            : `Calling ${peer?.name}...`}
        </Text>

        {rate > 0 && (
          <View style={styles.rateChip}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={styles.rateText}>{formatNumber(rate)} / min</Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        {/* Reject / Cancel Button */}
        <View style={styles.actionItem}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={onReject}
            activeOpacity={0.8}
          >
            <Text style={styles.btnEmoji}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.btnLabel}>
            {isIncoming ? 'Decline' : 'Cancel'}
          </Text>
        </View>

        {/* Accept Button (Only for Incoming) */}
        {isIncoming && (
          <View style={styles.actionItem}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.btnEmoji}>📞</Text>
            </TouchableOpacity>
            <Text style={styles.btnLabel}>Accept</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.giant,
    paddingHorizontal: spacing.xl,
    backgroundColor: '#07090E',
  },
  bgOverlay: {
    backgroundColor: 'rgba(7, 9, 14, 0.92)',
  },
  centerBox: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
  },
  peerName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    marginTop: spacing.lg,
  },
  callTypeLabel: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    marginTop: spacing.xs,
  },
  rateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.gold.primary,
    marginTop: spacing.md,
  },
  coinIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  rateText: {
    color: colors.gold.bright,
    fontSize: 12,
    fontWeight: typography.weights.bold,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.xl,
  },
  actionItem: {
    alignItems: 'center',
  },
  actionBtn: {
    width: 68,
    height: 68,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  rejectBtn: {
    backgroundColor: colors.feedback.error,
  },
  acceptBtn: {
    backgroundColor: colors.feedback.success,
  },
  btnEmoji: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: typography.weights.bold,
  },
  btnLabel: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    marginTop: spacing.sm,
  },
});

