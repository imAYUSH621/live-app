import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { hostCenterApi } from '../../src/api/endpoints';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';
import { formatNumber, formatDuration } from '../../src/utils/formatters';

export default function HostCenterScreen() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: centerData, isLoading } = useQuery({
    queryKey: ['host_center'],
    queryFn: () => hostCenterApi.getHostCenter(),
  });

  const { data: incomeData } = useQuery({
    queryKey: ['host_income'],
    queryFn: () => hostCenterApi.getHostIncome(),
  });

  const today = centerData?.today || { live_seconds: 0, diamonds: 0, call_seconds: 0, pk_wins: 0 };
  const month = centerData?.month || { total_diamonds: 0, total_live_seconds: 0 };
  const host = centerData?.host;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Host Center</Text>
        <TouchableOpacity
          style={styles.goLiveShortcut}
          onPress={() => router.push('/live/go-live' as any)}
        >
          <Text style={styles.goLiveText}>Go Live 🔴</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Host Status Card */}
          <View style={styles.hostStatusCard}>
            <View style={styles.statusRow}>
              <View>
                <Text style={styles.agencyLabel}>
                  {host?.agency_name ? `Agency: ${host.agency_name}` : 'Independent Host'}
                </Text>
                <Text style={styles.hostName}>{host?.real_name || 'Verified Host'}</Text>
              </View>
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Lv. {host?.level || 1}</Text>
              </View>
            </View>

            <View style={styles.diamondBalanceBox}>
              <Text style={styles.diamondBalanceLabel}>Host Diamonds Balance</Text>
              <Text style={styles.diamondBalanceValue}>
                💎 {formatNumber(centerData?.user?.diamonds || 0)}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.agencyNavRow}
              onPress={() => router.push('/host/agency' as any)}
            >
              <Text style={styles.agencyNavLabel}>Agency</Text>
              <Text style={styles.agencyNavDetail}>
                {host?.agency_name ? `${host.agency_name} ›` : 'Join or answer invites ›'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Today's Stats Grid */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Today's Performance</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>💎 {formatNumber(today.diamonds || 0)}</Text>
                <Text style={styles.statDesc}>Diamonds Earned</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>⏱️ {formatDuration(today.live_seconds || 0)}</Text>
                <Text style={styles.statDesc}>Live Duration</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>📞 {formatDuration(today.call_seconds || 0)}</Text>
                <Text style={styles.statDesc}>1v1 Calls Time</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>⚔️ {today.pk_wins || 0}</Text>
                <Text style={styles.statDesc}>PK Battles Won</Text>
              </View>
            </View>
          </View>

          {/* Monthly Income Summary */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Monthly Earnings</Text>
            <View style={styles.monthlyRow}>
              <View>
                <Text style={styles.monthlyValue}>
                  💎 {formatNumber(month.total_diamonds || 0)}
                </Text>
                <Text style={styles.monthlyDesc}>Month to Date Diamonds</Text>
              </View>
              <Button
                title="Exchange"
                variant="gold"
                size="sm"
                onPress={() => router.push('/wallet' as any)}
              />
            </View>
          </View>

          {/* Call Rates & Settings */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>1v1 Paid Call Preferences</Text>
            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>Call Rate Per Minute</Text>
              <Text style={styles.prefValue}>
                🪙 {centerData?.user?.call_rate || 120} coins/min
              </Text>
            </View>
            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>Incoming Calls Status</Text>
              <Text style={[styles.prefValue, { color: '#4ADE80' }]}>
                {centerData?.user?.call_enabled !== false ? '✅ Accepting Calls' : '❌ Disabled'}
              </Text>
            </View>
          </View>
        </ScrollView>
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
  goLiveShortcut: {
    backgroundColor: '#DC2626',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  goLiveText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 40,
  },
  hostStatusCard: {
    backgroundColor: '#0F172A',
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  agencyNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  agencyNavLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  agencyNavDetail: {
    color: '#64748B',
    fontSize: 13,
  },
  agencyLabel: {
    color: colors.gold.light,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    marginBottom: 2,
  },
  hostName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  levelBadge: {
    backgroundColor: colors.gold.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  levelText: {
    color: '#000000',
    fontWeight: typography.weights.heavy,
    fontSize: 12,
  },
  diamondBalanceBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  diamondBalanceLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: typography.sizes.xs,
    marginBottom: 4,
  },
  diamondBalanceValue: {
    color: '#38BDF8',
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.heavy,
  },
  sectionCard: {
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statBox: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    marginBottom: 4,
  },
  statDesc: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
  },
  monthlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
  },
  monthlyValue: {
    color: colors.gold.light,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.heavy,
    marginBottom: 2,
  },
  monthlyDesc: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: typography.sizes.xs,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  prefLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: typography.sizes.sm,
  },
  prefValue: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

