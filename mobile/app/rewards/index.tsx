import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { rewardsApi } from '../../src/api/endpoints';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/formatters';

const DEFAULT_DAYS = [
  { day: 1, coins: 50, checked: false },
  { day: 2, coins: 100, checked: false },
  { day: 3, coins: 150, checked: false },
  { day: 4, coins: 200, checked: false },
  { day: 5, coins: 300, checked: false },
  { day: 6, coins: 500, checked: false },
  { day: 7, coins: 1000, checked: false },
];

export default function RewardsScreen() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const spinValue = useState(new Animated.Value(0))[0];

  // Queries
  const { data: checkinData, refetch: refetchCheckin } = useQuery({
    queryKey: ['checkin'],
    queryFn: () => rewardsApi.getCheckin(),
  });

  const { data: spinData, refetch: refetchSpin } = useQuery({
    queryKey: ['spin'],
    queryFn: () => rewardsApi.getSpin(),
  });

  const { data: tasksData, refetch: refetchTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => rewardsApi.getTasks(),
  });

  const { data: adsStatus, refetch: refetchAds } = useQuery({
    queryKey: ['ads_status'],
    queryFn: () => rewardsApi.getAdsStatus(),
  });

  const { data: referralData } = useQuery({
    queryKey: ['referral'],
    queryFn: () => rewardsApi.getReferral(),
  });

  // Check-In Mutation
  const checkinMutation = useMutation({
    mutationFn: () => rewardsApi.doCheckin(),
    onSuccess: (res) => {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setToastMessage(`Checked in! +${res.reward} Coins credited! 🎉`);
      refetchCheckin();
      if (user) setUser({ ...user, coins: (user.coins || 0) + res.reward });
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Check-in failed');
    },
  });

  // Spin Wheel Mutation
  const spinMutation = useMutation({
    mutationFn: () => rewardsApi.doSpin(),
    onSuccess: (res) => {
      // Animate spin wheel
      setSpinning(true);
      spinValue.setValue(0);
      Animated.timing(spinValue, {
        toValue: 5 + (res.slice_index || 0) * 0.125,
        duration: 3000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setSpinning(false);
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
        setToastMessage(`You won ${res.reward_amount} ${res.reward_type}! 🎁`);
        refetchSpin();
        if (user && res.reward_type === 'coins') {
          setUser({ ...user, coins: (user.coins || 0) + res.reward_amount });
        }
      });
    },
    onError: (err: any) => {
      setSpinning(false);
      setToastMessage(err?.message || 'Spin failed');
    },
  });

  // Rewarded Ad Mutation
  const watchAdMutation = useMutation({
    mutationFn: () => rewardsApi.rewardAd(),
    onSuccess: (res) => {
      setToastMessage(`Ad completed! +${res.coins_rewarded} Coins! 🎬`);
      refetchAds();
      if (user) setUser({ ...user, coins: (user.coins || 0) + res.coins_rewarded });
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to reward ad');
    },
  });

  // Task Claim Mutation
  const claimTaskMutation = useMutation({
    mutationFn: (key: string) => rewardsApi.claimTask(key),
    onSuccess: (res) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      setToastMessage(`Task reward claimed! +${res.coins} Coins! 🪙`);
      refetchTasks();
      if (user) setUser({ ...user, coins: (user.coins || 0) + res.coins });
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to claim reward');
    },
  });

  const handleShareReferral = async () => {
    const code = referralData?.code || user?.referral_code || 'LIVEAPP';
    const inviteLink = `https://liveapp.example.com/join?ref=${code}`;
    try {
      await Share.share({
        title: 'Join me on LiveApp!',
        message: `Watch live streams, chat, and earn free coins with my referral code ${code}: ${inviteLink}`,
      });
    } catch (e: any) {
      console.warn('Share error:', e.message);
    }
  };

  const spinRotation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const daysList = checkinData?.days || DEFAULT_DAYS;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards Center</Text>
        <View style={styles.balancePill}>
          <Text style={styles.balanceText}>🪙 {formatNumber(user?.coins || 0)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. DAILY CHECK-IN STREAK */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.sectionBadge}>STREAK REWARDS</Text>
              <Text style={styles.cardTitle}>7-Day Daily Sign-in</Text>
            </View>
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {checkinData?.streak || 0} Days</Text>
            </View>
          </View>

          <Text style={styles.cardSubtitle}>
            Check in every day to claim exponential coin rewards!
          </Text>

          <View style={styles.daysRow}>
            {daysList.map((item: any, idx: number) => {
              const isChecked = item.checked || idx < (checkinData?.streak || 0);
              return (
                <View
                  key={idx}
                  style={[styles.dayItem, isChecked && styles.dayItemChecked]}
                >
                  <Text style={styles.dayNum}>Day {idx + 1}</Text>
                  <Text style={styles.dayIcon}>{isChecked ? '✅' : '🪙'}</Text>
                  <Text style={styles.dayCoins}>+{item.coins || 50 * (idx + 1)}</Text>
                </View>
              );
            })}
          </View>

          <Button
            title={checkinData?.checked_in_today ? 'Checked In Today ✅' : 'Check In Now'}
            variant={checkinData?.checked_in_today ? 'outline' : 'gold'}
            disabled={checkinData?.checked_in_today}
            loading={checkinMutation.isPending}
            onPress={() => checkinMutation.mutate()}
            style={styles.actionBtn}
          />
        </View>

        {/* 2. LUCKY WHEEL SPIN */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.sectionBadge}>LUCKY DRAW</Text>
              <Text style={styles.cardTitle}>Golden Spin Wheel</Text>
            </View>
            <Text style={styles.freeSpinsText}>
              Free: {spinData?.free_spins || 1}
            </Text>
          </View>

          <View style={styles.wheelCenterContainer}>
            <Animated.View
              style={[
                styles.wheelGraphic,
                { transform: [{ rotate: spinRotation }] },
              ]}
            >
              <Text style={styles.wheelSliceIcon}>🎡</Text>
            </Animated.View>
            <View style={styles.wheelPointer}>
              <Text style={styles.pointerText}>🔻</Text>
            </View>
          </View>

          <Button
            title={spinning ? 'Spinning...' : 'Spin the Wheel 🎯'}
            variant="gold"
            loading={spinning || spinMutation.isPending}
            disabled={spinning}
            onPress={() => spinMutation.mutate()}
            style={styles.actionBtn}
          />
        </View>

        {/* 3. WATCH REWARDED ADS */}
        <View style={styles.card}>
          <View style={styles.adRow}>
            <View style={styles.adIconBox}>
              <Text style={styles.adEmoji}>🎬</Text>
            </View>
            <View style={styles.adInfo}>
              <Text style={styles.adTitle}>Watch Short Video Ad</Text>
              <Text style={styles.adDesc}>
                Remaining today: {adsStatus?.remaining_today ?? 5} views
              </Text>
            </View>
            <Button
              title={`+${adsStatus?.reward_coins || 100} 🪙`}
              variant="gold"
              size="sm"
              loading={watchAdMutation.isPending}
              disabled={adsStatus && !adsStatus.can_watch}
              onPress={() => watchAdMutation.mutate()}
            />
          </View>
        </View>

        {/* 4. DAILY TASKS */}
        <View style={styles.card}>
          <Text style={styles.sectionBadge}>DAILY MISSIONS</Text>
          <Text style={styles.cardTitle}>Complete & Earn</Text>

          {tasksData?.daily && tasksData.daily.length > 0 ? (
            tasksData.daily.map((task: any) => {
              const isClaimed = task.claimed;
              const isFinished = task.progress >= task.target;
              return (
                <View key={task.key} style={styles.taskItem}>
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskName}>{task.title}</Text>
                    <Text style={styles.taskProgress}>
                      {task.progress} / {task.target} • Reward: +{task.reward_coins} Coins
                    </Text>
                  </View>
                  <Button
                    title={isClaimed ? 'Claimed' : isFinished ? 'Claim' : 'Go'}
                    variant={isClaimed ? 'outline' : isFinished ? 'gold' : 'surface'}
                    size="sm"
                    disabled={isClaimed || !isFinished}
                    loading={claimTaskMutation.isPending}
                    onPress={() => claimTaskMutation.mutate(task.key)}
                  />
                </View>
              );
            })
          ) : (
            <View style={styles.taskItem}>
              <View style={styles.taskInfo}>
                <Text style={styles.taskName}>Watch Live Streams (10 mins)</Text>
                <Text style={styles.taskProgress}>Reward: +100 Coins</Text>
              </View>
              <Button
                title="Go"
                variant="surface"
                size="sm"
                onPress={() => router.push('/(tabs)' as any)}
              />
            </View>
          )}
        </View>

        {/* 5. REFERRAL SQUAD */}
        <View style={[styles.card, styles.referralCard]}>
          <Text style={styles.sectionBadge}>REFERRAL BONUSES</Text>
          <Text style={styles.cardTitle}>Invite Friends, Earn 500 Coins</Text>
          <Text style={styles.cardSubtitle}>
            Share your unique invite code. You both receive 500 free coins on their first login!
          </Text>

          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>YOUR INVITE CODE:</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>
                {referralData?.code || user?.referral_code || 'LIVEAPP888'}
              </Text>
            </View>
          </View>

          <Button
            title="Share Invite Link 🚀"
            variant="gold"
            onPress={handleShareReferral}
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
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
  balancePill: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  balanceText: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionBadge: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    color: colors.gold.primary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  streakBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  streakText: {
    color: '#F87171',
    fontWeight: typography.weights.bold,
    fontSize: 12,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },
  dayItem: {
    width: '13%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radii.sm,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  dayItemChecked: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderColor: colors.gold.border,
  },
  dayNum: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    marginBottom: 4,
  },
  dayIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  dayCoins: {
    color: colors.gold.light,
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  actionBtn: {
    marginTop: spacing.xs,
  },
  freeSpinsText: {
    color: colors.gold.light,
    fontSize: 12,
    fontWeight: typography.weights.bold,
  },
  wheelCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  wheelGraphic: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#1E293B',
    borderWidth: 4,
    borderColor: colors.gold.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelSliceIcon: {
    fontSize: 80,
  },
  wheelPointer: {
    position: 'absolute',
    top: -12,
  },
  pointerText: {
    fontSize: 24,
  },
  adRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adIconBox: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  adEmoji: {
    fontSize: 24,
  },
  adInfo: {
    flex: 1,
  },
  adTitle: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  adDesc: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: typography.sizes.xs,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  taskInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  taskName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    marginBottom: 2,
  },
  taskProgress: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: typography.sizes.xs,
  },
  referralCard: {
    backgroundColor: '#16192B',
    borderColor: 'rgba(212, 175, 55, 0.25)',
  },
  codeRow: {
    marginVertical: spacing.sm,
  },
  codeLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontWeight: typography.weights.bold,
    marginBottom: 4,
  },
  codeBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: colors.gold.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  codeText: {
    color: colors.gold.light,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.heavy,
    letterSpacing: 3,
  },
});
