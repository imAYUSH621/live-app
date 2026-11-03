import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Sheet, Avatar, Button, EmptyState } from '../../components/ui';
import { pkApi } from '../../api/endpoints';
import { colors, typography, radii, spacing } from '../../theme';
import { MiniProfile } from '../../api/types';

interface PKInviteModalProps {
  visible: boolean;
  onClose: () => void;
  onInviteSent: (hostName: string) => void;
}

export const PKInviteModal: React.FC<PKInviteModalProps> = ({
  visible,
  onClose,
  onInviteSent,
}) => {
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['pk_candidates'],
    queryFn: () => pkApi.getCandidates(),
    enabled: visible,
  });

  const handleRandomMatch = async () => {
    try {
      const res = await pkApi.random();
      if (res.matched) {
        onInviteSent('Random Match Opponent');
      } else {
        onInviteSent('Queue');
      }
      onClose();
    } catch (e: any) {
      console.warn('[PK] Random match error', e.message);
    }
  };

  const handleInviteCandidate = async (targetRoomId: number, targetName: string) => {
    try {
      await pkApi.invite(targetRoomId);
      onInviteSent(targetName);
      onClose();
    } catch (e: any) {
      console.warn('[PK] Invite error', e.message);
    }
  };

  const renderCandidate = ({ item }: { item: any }) => {
    const host: MiniProfile = item.host || item;
    return (
      <View style={styles.candidateRow}>
        <Avatar url={host.avatar_url} name={host.name} size={42} vipLevel={host.vip_level} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{host.name}</Text>
          <Text style={styles.roomCategory}>{item.category || 'Live Room'}</Text>
        </View>
        <Button
          title="Challenge"
          variant="gold"
          size="sm"
          onPress={() => handleInviteCandidate(item.id, host.name)}
        />
      </View>
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="PK Battle Challenge">
      {/* Random Match Action Button */}
      <TouchableOpacity
        style={styles.randomBanner}
        onPress={handleRandomMatch}
        activeOpacity={0.8}
      >
        <Text style={styles.randomIcon}>🎲</Text>
        <View style={styles.randomDetails}>
          <Text style={styles.randomTitle}>Quick Random Match</Text>
          <Text style={styles.randomSub}>Auto-match with an available live host</Text>
        </View>
        <Text style={styles.randomArrow}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionHeader}>Available Live Hosts</Text>

      <FlatList
        data={candidates}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderCandidate}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No Available Hosts"
              description="No other live hosts are currently free for PK battle. Try Quick Random Match!"
            />
          ) : null
        }
      />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  randomBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: colors.gold.primary,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  randomIcon: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  randomDetails: {
    flex: 1,
  },
  randomTitle: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  randomSub: {
    color: colors.text.muted,
    fontSize: 11,
  },
  randomArrow: {
    color: colors.gold.light,
    fontSize: 22,
    fontWeight: typography.weights.bold,
  },
  sectionHeader: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  list: {
    height: 280,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: radii.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  info: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  name: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  roomCategory: {
    color: colors.text.muted,
    fontSize: 11,
  },
});

