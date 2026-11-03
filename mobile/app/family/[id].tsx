import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '../../src/api/endpoints';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Avatar, Badge, Toast } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/formatters';

export default function FamilyDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const familyId = Number(params.id);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: family, isLoading } = useQuery({
    queryKey: ['family', familyId],
    queryFn: () => socialApi.getFamily(familyId),
  });

  const joinMutation = useMutation({
    mutationFn: () => socialApi.joinFamily(familyId),
    onSuccess: (res) => {
      setToastMessage(
        res.status === 'pending'
          ? 'Application submitted! Awaiting leader approval.'
          : 'Welcome to the family! 🎉'
      );
      queryClient.invalidateQueries({ queryKey: ['family', familyId] });
      if (res.status === 'member' && user) {
        setUser({ ...user, family_id: familyId });
      }
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to join family');
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => socialApi.leaveFamily(),
    onSuccess: () => {
      setToastMessage('You have left the family.');
      if (user) setUser({ ...user, family_id: null as any });
      router.back();
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to leave family');
    },
  });

  const isMyFamily = user?.family_id === familyId;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Family Details</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      ) : family ? (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Family Banner Card */}
          <View style={styles.familyCard}>
            <View style={styles.badgeBox}>
              <Text style={styles.badgeEmoji}>{family.badge || '🛡️'}</Text>
            </View>
            <Text style={styles.familyName}>{family.name}</Text>
            <Text style={styles.familyRank}>Level {family.level || 1} Family Squad</Text>
            {family.notice ? (
              <Text style={styles.noticeText}>"{family.notice}"</Text>
            ) : null}

            <View style={styles.statsRow}>
              <View style={styles.statCol}>
                <Text style={styles.statVal}>{family.members?.length || 1}</Text>
                <Text style={styles.statLabel}>Members</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCol}>
                <Text style={styles.statVal}>{formatNumber(family.exp || 0)}</Text>
                <Text style={styles.statLabel}>Total EXP</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCol}>
                <Text style={styles.statVal}>#{family.rank || 1}</Text>
                <Text style={styles.statLabel}>Squad Rank</Text>
              </View>
            </View>

            {isMyFamily ? (
              <Button
                title="Leave Family"
                variant="outline"
                loading={leaveMutation.isPending}
                onPress={() =>
                  Alert.alert('Leave Family', 'Are you sure you want to exit this family squad?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => leaveMutation.mutate() },
                  ])
                }
                style={styles.actionBtn}
              />
            ) : (
              <Button
                title="Join Family 🛡️"
                variant="gold"
                loading={joinMutation.isPending}
                onPress={() => joinMutation.mutate()}
                style={styles.actionBtn}
              />
            )}
          </View>

          {/* Members List */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Squad Members</Text>
            {family.members && family.members.length > 0 ? (
              family.members.map((member: any) => (
                <View key={member.id} style={styles.memberRow}>
                  <Avatar
                    url={member.avatar_url}
                    name={member.name}
                    size={42}
                    vipLevel={member.vip_level}
                  />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberRole}>
                      {member.role === 'owner' ? '👑 Leader' : member.role === 'elder' ? '⚔️ Elder' : 'Member'}
                    </Text>
                  </View>
                  <Text style={styles.memberContribution}>
                    🪙 {formatNumber(member.contribution || 0)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No members listed yet.</Text>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.centerBox}>
          <Text style={{ color: '#FFFFFF' }}>Family not found</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: {
    padding: spacing.xs,
  },
  backArrow: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 40,
  },
  familyCard: {
    backgroundColor: '#0F172A',
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
  },
  badgeBox: {
    width: 72,
    height: 72,
    borderRadius: radii.full,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 2,
    borderColor: colors.gold.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  badgeEmoji: {
    fontSize: 36,
  },
  familyName: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.heavy,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  familyRank: {
    color: colors.gold.light,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.sm,
  },
  noticeText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: typography.sizes.sm,
    fontStyle: 'italic',
    textAlign: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    width: '100%',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  statCol: {
    alignItems: 'center',
  },
  statVal: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.md,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionBtn: {
    width: '100%',
  },
  section: {
    backgroundColor: '#0F172A',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  memberName: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  memberRole: {
    color: colors.gold.light,
    fontSize: 11,
    marginTop: 2,
  },
  memberContribution: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

