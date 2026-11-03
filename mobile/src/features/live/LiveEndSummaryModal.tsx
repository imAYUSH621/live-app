import React from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Button, Avatar } from '../../components/ui';
import { colors, typography, radii, spacing } from '../../theme';
import { MiniProfile } from '../../api/types';
import { formatNumber, formatDuration } from '../../utils/formatters';

interface LiveEndSummaryModalProps {
  visible: boolean;
  isHost: boolean;
  host: MiniProfile | null;
  summary: {
    duration?: number;
    peakViewers?: number;
    diamondsEarned?: number;
    likes?: number;
  } | null;
  onClose: () => void;
}

export const LiveEndSummaryModal: React.FC<LiveEndSummaryModalProps> = ({
  visible,
  isHost,
  host,
  summary,
  onClose,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Avatar
            url={host?.avatar_url}
            name={host?.name || 'Host'}
            size={72}
            vipLevel={host?.vip_level}
          />
          <Text style={styles.hostName}>{host?.name || 'Host'}</Text>
          <Text style={styles.title}>
            {isHost ? 'Broadcast Ended' : 'Live Stream Ended'}
          </Text>

          {/* Stats grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {formatDuration(summary?.duration || 0)}
              </Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statNumber}>
                {formatNumber(summary?.peakViewers || 1)}
              </Text>
              <Text style={styles.statLabel}>Peak Viewers</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#38BDF8' }]}>
                {formatNumber(summary?.diamondsEarned || 0)}
              </Text>
              <Text style={styles.statLabel}>Diamonds</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#F472B6' }]}>
                {formatNumber(summary?.likes || 0)}
              </Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
          </View>

          <Button
            title="Back to Feed"
            variant="gold"
            size="lg"
            onPress={onClose}
            style={styles.closeBtn}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xxl,
    borderWidth: 1.5,
    borderColor: colors.gold.border,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  hostName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    marginTop: spacing.sm,
  },
  title: {
    color: colors.gold.light,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.heavy,
    marginVertical: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: spacing.lg,
  },
  statBox: {
    width: '48%',
    backgroundColor: colors.background.elevated,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.heavy,
  },
  statLabel: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: '100%',
    marginTop: spacing.xs,
  },
});

