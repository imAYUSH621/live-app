import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Seat, MiniProfile } from '../../api/types';
import { Avatar } from '../../components/ui';
import { colors, radii, spacing, typography } from '../../theme';

interface LiveSeatsOverlayProps {
  seats: Seat[];
  onPressSeat: (seatIndex: number, currentSeat?: Seat) => void;
}

export const LiveSeatsOverlay: React.FC<LiveSeatsOverlayProps> = ({
  seats,
  onPressSeat,
}) => {
  if (!seats || seats.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.seatRow}>
        {seats.map((seat, idx) => {
          const user = seat.user;
          return (
            <TouchableOpacity
              key={seat.index ?? idx}
              style={styles.seatItem}
              onPress={() => onPressSeat(seat.index ?? idx, seat)}
              activeOpacity={0.8}
            >
              {user ? (
                <View style={styles.occupiedBox}>
                  <Avatar
                    url={user.avatar_url}
                    name={user.name}
                    size={38}
                    vipLevel={user.vip_level}
                  />
                  {seat.muted && (
                    <View style={styles.mutePill}>
                      <Text style={styles.muteIcon}>🔇</Text>
                    </View>
                  )}
                  <Text style={styles.seatName} numberOfLines={1}>
                    {user.name}
                  </Text>
                </View>
              ) : (
                <View style={styles.emptySeat}>
                  <Text style={styles.plusIcon}>+</Text>
                  <Text style={styles.seatNumber}>{idx + 1}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  seatItem: {
    alignItems: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
  },
  occupiedBox: {
    alignItems: 'center',
    position: 'relative',
  },
  mutePill: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: radii.full,
    padding: 2,
  },
  muteIcon: {
    fontSize: 8,
  },
  seatName: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: typography.weights.medium,
    marginTop: 2,
    maxWidth: 42,
  },
  emptySeat: {
    width: 38,
    height: 38,
    borderRadius: radii.full,
    backgroundColor: 'rgba(7, 9, 14, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusIcon: {
    color: colors.gold.light,
    fontSize: 14,
    fontWeight: typography.weights.bold,
    lineHeight: 16,
  },
  seatNumber: {
    color: colors.text.muted,
    fontSize: 8,
  },
});

