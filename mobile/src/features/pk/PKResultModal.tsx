import React from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { usePkBattleStore } from '../../stores/pkBattleStore';
import { useLiveRoomStore } from '../../stores/liveRoomStore';
import { Button, Avatar } from '../../components/ui';
import { colors, typography, radii, spacing } from '../../theme';
import { formatNumber } from '../../utils/formatters';

export const PKResultModal: React.FC = () => {
  const { status, hostScore, opponentScore, opponent, winnerId, resetPk } =
    usePkBattleStore();
  const room = useLiveRoomStore((s) => s.room);

  if (status !== 'ended') return null;

  const isHostWinner = winnerId && room && winnerId === room.host_id;
  const isDraw = !winnerId || hostScore === opponentScore;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>
            {isDraw ? '🤝' : isHostWinner ? '🏆' : '💥'}
          </Text>

          <Text
            style={[
              styles.resultTitle,
              isDraw
                ? styles.drawTitle
                : isHostWinner
                ? styles.winTitle
                : styles.loseTitle,
            ]}
          >
            {isDraw ? 'DRAW BATTLE' : isHostWinner ? 'VICTORY!' : 'DEFEAT'}
          </Text>

          {/* Versus Avatars & Scores */}
          <View style={styles.vsRow}>
            <View style={styles.participantBox}>
              <Text style={styles.scoreNumber}>{formatNumber(hostScore)}</Text>
              <Text style={styles.roleLabel}>Our Team</Text>
            </View>

            <Text style={styles.vsCenter}>VS</Text>

            <View style={styles.participantBox}>
              <Text style={styles.scoreNumber}>
                {formatNumber(opponentScore)}
              </Text>
              <Text style={styles.roleLabel}>Opponent</Text>
            </View>
          </View>

          <Button
            title="Continue Watching"
            variant="gold"
            size="md"
            onPress={resetPk}
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
    backgroundColor: 'rgba(5, 7, 11, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    zIndex: 9999,
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xxl,
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.xs,
  },
  resultTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.heavy,
    letterSpacing: 1.5,
    marginBottom: spacing.lg,
  },
  winTitle: {
    color: colors.gold.light,
  },
  loseTitle: {
    color: colors.feedback.error,
  },
  drawTitle: {
    color: '#38BDF8',
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: spacing.xl,
    backgroundColor: colors.background.elevated,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
  },
  participantBox: {
    alignItems: 'center',
  },
  scoreNumber: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.heavy,
  },
  roleLabel: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  vsCenter: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.heavy,
  },
  closeBtn: {
    width: '100%',
  },
});

