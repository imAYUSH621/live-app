import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Avatar, Badge, Button } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { formatNumber } from '../../src/utils/formatters';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Not signed in</Text>
          <Button
            title="Go to Login"
            onPress={() => router.replace('/(auth)/login')}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity
            style={styles.settingsHeaderBtn}
            onPress={() => router.push('/settings' as any)}
          >
            <Text style={styles.settingsHeaderIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* User Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <Avatar
              url={user.avatar_url}
              name={user.name}
              size={68}
              vipLevel={user.vip_level}
            />

            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user.name}
                </Text>
                {user.gender && (
                  <Text style={styles.genderIcon}>
                    {user.gender === 'female' ? '♀' : '♂'}
                  </Text>
                )}
              </View>

              <Text style={styles.uidText}>
                ID: {user.uid_display || user.uid}
              </Text>

              {/* Badges */}
              <View style={styles.badgeRow}>
                <Badge type="wealth" level={user.wealth_level || 1} />
                <Badge type="charm" level={user.charm_level || 1} style={{ marginLeft: 6 }} />
                {user.vip_level > 0 && (
                  <Badge type="vip" level={user.vip_level} style={{ marginLeft: 6 }} />
                )}
              </View>
            </View>
          </View>

          {/* Social Counts */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {formatNumber(user.counts?.following || 0)}
              </Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {formatNumber(user.counts?.followers || 0)}
              </Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {formatNumber(user.counts?.friends || 0)}
              </Text>
              <Text style={styles.statLabel}>Friends</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {formatNumber(user.counts?.visitors || 0)}
              </Text>
              <Text style={styles.statLabel}>Visitors</Text>
            </View>
          </View>
        </View>

        {/* Wallet Balance Card */}
        <TouchableOpacity
          style={styles.walletCard}
          onPress={() => router.push('/wallet' as any)}
          activeOpacity={0.8}
        >
          <View style={styles.walletHeader}>
            <Text style={styles.walletTitle}>My Wallet</Text>
            <Text style={styles.walletArrow}>Recharge & Details ›</Text>
          </View>

          <View style={styles.walletBalances}>
            {/* Coins */}
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>Coins</Text>
              <View style={styles.coinRow}>
                <Text style={styles.balanceCoinIcon}>🪙</Text>
                <Text style={styles.coinAmount}>{formatNumber(user.coins)}</Text>
              </View>
            </View>

            {/* Diamonds */}
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>Diamonds</Text>
              <View style={styles.coinRow}>
                <Text style={styles.balanceDiamondIcon}>💎</Text>
                <Text style={styles.diamondAmount}>
                  {formatNumber(user.diamonds)}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Action Items List */}
        <View style={styles.menuCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/store' as any)}
          >
            <Text style={styles.menuIcon}>👑</Text>
            <Text style={styles.menuLabel}>Luxury VIP & Noble Store</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/rewards' as any)}
          >
            <Text style={styles.menuIcon}>🎁</Text>
            <Text style={styles.menuLabel}>Daily Rewards & Tasks</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/host' as any)}
          >
            <Text style={styles.menuIcon}>🎙️</Text>
            <Text style={styles.menuLabel}>Host Center & Earnings</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <Button
          title="Sign Out"
          variant="danger"
          size="md"
          onPress={handleLogout}
          style={styles.logoutBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 60,
  },
  header: {
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
  },
  settingsHeaderBtn: {
    padding: spacing.xs,
  },
  settingsHeaderIcon: {
    fontSize: 22,
  },
  walletArrow: {
    color: colors.gold.light,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
  },
  profileCard: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginRight: 6,
  },
  genderIcon: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  uidText: {
    color: colors.text.muted,
    fontSize: typography.sizes.xs,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  statLabel: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border.subtle,
  },
  walletCard: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  walletHeader: {
    marginBottom: spacing.md,
  },
  walletTitle: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  walletBalances: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceBox: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    borderRadius: radii.md,
    padding: spacing.md,
    marginHorizontal: 4,
  },
  balanceLabel: {
    color: colors.text.muted,
    fontSize: 11,
    marginBottom: 4,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceCoinIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  balanceDiamondIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  coinAmount: {
    color: colors.gold.light,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.heavy,
  },
  diamondAmount: {
    color: '#38BDF8',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.heavy,
  },
  menuCard: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  menuLabel: {
    color: colors.text.primary,
    fontSize: typography.sizes.md,
    flex: 1,
  },
  menuArrow: {
    color: colors.text.muted,
    fontSize: 20,
    fontWeight: typography.weights.bold,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
  },
  logoutBtn: {
    marginTop: spacing.sm,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: typography.sizes.md,
  },
});

