import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Avatar, Button } from '../../components/ui';
import { colors, typography, radii, spacing } from '../../theme';
import { MiniProfile } from '../../api/types';
import { formatNumber } from '../../utils/formatters';

interface LiveTopBarProps {
  host: MiniProfile | null;
  viewers: number;
  diamonds?: number;
  onClose: () => void;
  onFollow?: () => void;
  isFollowing?: boolean;
}

export const LiveTopBar: React.FC<LiveTopBarProps> = ({
  host,
  viewers,
  diamonds = 0,
  onClose,
  onFollow,
  isFollowing = false,
}) => {
  return (
    <View style={styles.container}>
      {/* Host Chip */}
      <View style={styles.hostChip}>
        <Avatar
          url={host?.avatar_url}
          name={host?.name || 'Host'}
          size={36}
          vipLevel={host?.vip_level}
        />
        <View style={styles.hostDetails}>
          <Text style={styles.hostName} numberOfLines={1}>
            {host?.name || 'Live Host'}
          </Text>
          <View style={styles.diamondRow}>
            <Text style={styles.diamondIcon}>💎</Text>
            <Text style={styles.diamondCount}>{formatNumber(diamonds)}</Text>
          </View>
        </View>

        {!isFollowing && onFollow && (
          <TouchableOpacity
            style={styles.followButton}
            onPress={onFollow}
            activeOpacity={0.8}
          >
            <Text style={styles.followText}>+ Follow</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Right controls */}
      <View style={styles.rightGroup}>
        {/* Viewer count pill */}
        <View style={styles.viewerPill}>
          <Text style={styles.viewerIcon}>👥</Text>
          <Text style={styles.viewerText}>{formatNumber(viewers)}</Text>
        </View>

        {/* Close Button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    zIndex: 10,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    borderRadius: radii.full,
    paddingLeft: 3,
    paddingRight: spacing.md,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxWidth: '58%',
  },
  hostDetails: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  hostName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: typography.weights.bold,
  },
  diamondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  diamondIcon: {
    fontSize: 10,
    marginRight: 2,
  },
  diamondCount: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  followButton: {
    backgroundColor: colors.gold.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    marginLeft: 6,
  },
  followText: {
    color: '#07090E',
    fontSize: 10,
    fontWeight: typography.weights.heavy,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  viewerIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  viewerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: typography.weights.bold,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radii.full,
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: typography.weights.bold,
  },
});

