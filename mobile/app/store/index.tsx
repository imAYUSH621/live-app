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
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeApi, authApi } from '../../src/api/endpoints';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/formatters';

type StoreTab = 'vip' | 'noble' | 'items' | 'pretty_id' | 'inventory';

const VIP_LEVELS = [
  { level: 1, name: 'Bronze VIP', price: 1000, days: 30, perks: 'VIP 1 Badge, 5% Bonus EXP, Exclusive Chat Bubble' },
  { level: 2, name: 'Silver VIP', price: 3000, days: 30, perks: 'VIP 2 Badge, 10% Bonus EXP, Special Entry Notice' },
  { level: 3, name: 'Gold VIP', price: 8000, days: 30, perks: 'VIP 3 Badge, 15% Bonus EXP, Golden Chat Frame, Flying Banner' },
  { level: 4, name: 'Platinum VIP', price: 20000, days: 30, perks: 'VIP 4 Badge, 20% Bonus EXP, Platinum Mount, Kick Protection' },
  { level: 5, name: 'Diamond VIP', price: 50000, days: 30, perks: 'VIP 5 Badge, 30% Bonus EXP, Diamond Steed Mount, Red Carpet Entry' },
  { level: 6, name: 'Crown VIP', price: 120000, days: 30, perks: 'VIP 6 Badge, 40% Bonus EXP, Crown Chariot, Room Moderator Shield' },
  { level: 7, name: 'Supreme VIP', price: 300000, days: 30, perks: 'VIP 7 Badge, 50% Bonus EXP, Dragon Mount, App-Wide Entry Marquee' },
];

const NOBLE_RANKS = [
  { rank: 1, name: 'Knight', price: 5000, cashback: 500, title: '🛡️ Knight', perk: 'Noble Badge, Entry Banner, 10% Gift Rebate' },
  { rank: 2, name: 'Baron', price: 15000, cashback: 1500, title: '⚔️ Baron', perk: 'Baron Badge, Royal Mount, 12% Gift Rebate' },
  { rank: 3, name: 'Viscount', price: 40000, cashback: 4500, title: '🏰 Viscount', perk: 'Viscount Badge, Silver Carriage, 15% Gift Rebate' },
  { rank: 4, name: 'Count', price: 100000, cashback: 12000, title: '👑 Count', perk: 'Count Badge, Golden Pegasus, 18% Gift Rebate' },
  { rank: 5, name: 'Marquis', price: 250000, cashback: 35000, title: '⚜️ Marquis', perk: 'Marquis Badge, Phoenix Mount, 20% Gift Rebate' },
  { rank: 6, name: 'Duke', price: 600000, cashback: 90000, title: '🦅 Duke', perk: 'Duke Badge, Royal Fleet Entry, 25% Gift Rebate' },
  { rank: 7, name: 'King', price: 1500000, cashback: 250000, title: '🦁 King', perk: 'King Badge, Celestial Dragon, King Global Broadcast' },
];

export default function StoreScreen() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [activeTab, setActiveTab] = useState<StoreTab>('vip');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Queries
  const { data: storeItems, isLoading: loadingItems } = useQuery({
    queryKey: ['store_items', activeTab],
    queryFn: () => storeApi.getStoreItems(),
    enabled: activeTab === 'items' || activeTab === 'inventory',
  });

  const { data: fancyIds, isLoading: loadingFancyIds } = useQuery({
    queryKey: ['fancy_ids'],
    queryFn: () => storeApi.getFancyIds(),
    enabled: activeTab === 'pretty_id',
  });

  // Purchase Mutations
  const buyVipMutation = useMutation({
    mutationFn: (level: number) => storeApi.buyVip(level),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      setToastMessage('VIP membership activated successfully! 👑');
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to activate VIP');
    },
  });

  const buyNobleMutation = useMutation({
    mutationFn: (rank: number) => storeApi.buyNoble(rank),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      setToastMessage('Noble status acquired! All hail the noble! 🛡️');
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to acquire Noble rank');
    },
  });

  const buyItemMutation = useMutation({
    mutationFn: (itemId: number) => storeApi.buyStoreItem(itemId),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['store_items'] });
      setToastMessage('Item purchased and added to your backpack! 🎒');
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to purchase item');
    },
  });

  const buyFancyIdMutation = useMutation({
    mutationFn: (id: number) => storeApi.buyFancyId(id),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['fancy_ids'] });
      setToastMessage('Pretty ID assigned to your profile! ✨');
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to buy Pretty ID');
    },
  });

  const equipItemMutation = useMutation({
    mutationFn: ({ userItemId, equip }: { userItemId: number; equip: boolean }) =>
      storeApi.equipStoreItem(userItemId, equip),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      setToastMessage('Item equipment status updated!');
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to equip item');
    },
  });

  const handleBuyVip = (level: number, price: number) => {
    if ((user?.coins || 0) < price) {
      Alert.alert('Insufficient Coins', 'Recharge coins to purchase this VIP membership.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Recharge', onPress: () => router.push('/wallet/recharge' as any) },
      ]);
      return;
    }
    Alert.alert('Confirm Purchase', `Activate VIP Level ${level} for ${formatNumber(price)} coins?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Buy Now', onPress: () => buyVipMutation.mutate(level) },
    ]);
  };

  const handleBuyNoble = (rank: number, name: string, price: number) => {
    if ((user?.coins || 0) < price) {
      Alert.alert('Insufficient Coins', 'Recharge coins to purchase this Noble title.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Recharge', onPress: () => router.push('/wallet/recharge' as any) },
      ]);
      return;
    }
    Alert.alert('Confirm Noble Title', `Acquire ${name} rank for ${formatNumber(price)} coins?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Acquire', onPress: () => buyNobleMutation.mutate(rank) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Luxury Store</Text>
        <TouchableOpacity
          onPress={() => router.push('/wallet/recharge' as any)}
          style={styles.balancePill}
        >
          <Text style={styles.balanceCoinIcon}>🪙</Text>
          <Text style={styles.balanceText}>{formatNumber(user?.coins || 0)}</Text>
          <Text style={styles.plusSign}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Store Navigation Tabs */}
      <View style={styles.tabBar}>
        {(['vip', 'noble', 'items', 'pretty_id', 'inventory'] as StoreTab[]).map((tab) => {
          const titles: Record<StoreTab, string> = {
            vip: 'VIP Privilege',
            noble: 'Noble Rank',
            items: 'Mounts & FX',
            pretty_id: 'Pretty IDs',
            inventory: 'Backpack',
          };
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {titles[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab Content */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* TAB 1: VIP PRIVILEGES */}
        {activeTab === 'vip' && (
          <View style={styles.section}>
            <View style={styles.bannerCard}>
              <Text style={styles.bannerBadge}>👑 ROYAL PRIVILEGES</Text>
              <Text style={styles.bannerTitle}>Unlock Elite VIP Status</Text>
              <Text style={styles.bannerSubtitle}>
                Exclusive chat bubbles, glowing entry notifications, bonus EXP and kick protection.
              </Text>
            </View>

            {VIP_LEVELS.map((item) => {
              const isCurrent = user?.vip_level === item.level;
              return (
                <View key={item.level} style={styles.vipCard}>
                  <View style={styles.vipHeader}>
                    <View style={styles.vipLevelBadge}>
                      <Text style={styles.vipLevelText}>VIP {item.level}</Text>
                    </View>
                    <View style={styles.vipTitleCol}>
                      <Text style={styles.vipName}>{item.name}</Text>
                      <Text style={styles.vipDuration}>{item.days} Days Duration</Text>
                    </View>
                    <Text style={styles.vipPrice}>🪙 {formatNumber(item.price)}</Text>
                  </View>

                  <Text style={styles.vipPerksText}>{item.perks}</Text>

                  <Button
                    title={isCurrent ? 'Current Plan' : `Activate VIP ${item.level}`}
                    variant={isCurrent ? 'outline' : 'gold'}
                    size="sm"
                    loading={buyVipMutation.isPending}
                    disabled={isCurrent}
                    onPress={() => handleBuyVip(item.level, item.price)}
                    style={styles.cardBtn}
                  />
                </View>
              );
            })}
          </View>
        )}

        {/* TAB 2: NOBLE STATUS */}
        {activeTab === 'noble' && (
          <View style={styles.section}>
            <View style={[styles.bannerCard, styles.nobleBanner]}>
              <Text style={styles.bannerBadge}>🛡️ ARISTOCRACY</Text>
              <Text style={styles.bannerTitle}>Reign as a Royal Noble</Text>
              <Text style={styles.bannerSubtitle}>
                Instant gift coin cashback, royal mounts, room broadside entry effects, and lordly authority.
              </Text>
            </View>

            {NOBLE_RANKS.map((item) => {
              const isCurrent = user?.noble_level === item.rank;
              return (
                <View key={item.rank} style={styles.nobleCard}>
                  <View style={styles.nobleHeader}>
                    <Text style={styles.nobleTitleEmoji}>{item.title}</Text>
                    <View style={styles.cashbackBadge}>
                      <Text style={styles.cashbackText}>+{formatNumber(item.cashback)} Cashback</Text>
                    </View>
                  </View>

                  <Text style={styles.noblePerk}>{item.perk}</Text>

                  <View style={styles.nobleBottomRow}>
                    <Text style={styles.noblePrice}>🪙 {formatNumber(item.price)} Coins</Text>
                    <Button
                      title={isCurrent ? 'Active Title' : 'Acquire Title'}
                      variant={isCurrent ? 'outline' : 'gold'}
                      size="sm"
                      loading={buyNobleMutation.isPending}
                      disabled={isCurrent}
                      onPress={() => handleBuyNoble(item.rank, item.name, item.price)}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* TAB 3: MOUNTS & FX ITEMS */}
        {activeTab === 'items' && (
          <View style={styles.section}>
            {loadingItems ? (
              <ActivityIndicator size="large" color={colors.gold.primary} style={{ marginTop: 40 }} />
            ) : storeItems && storeItems.length > 0 ? (
              <View style={styles.itemsGrid}>
                {storeItems.map((item: any) => (
                  <View key={item.id} style={styles.itemCard}>
                    <View style={styles.itemIconBox}>
                      <Text style={styles.itemIconEmoji}>{item.icon || '🦄'}</Text>
                    </View>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemType}>{item.type?.toUpperCase() || 'MOUNT'}</Text>
                    <Text style={styles.itemPrice}>🪙 {formatNumber(item.price || 0)}</Text>
                    <Button
                      title="Buy"
                      variant="gold"
                      size="sm"
                      loading={buyItemMutation.isPending}
                      onPress={() => buyItemMutation.mutate(item.id)}
                      style={styles.itemBuyBtn}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🛍️</Text>
                <Text style={styles.emptyTitle}>No Store Items</Text>
                <Text style={styles.emptyDesc}>New mounts and entry effects arriving soon.</Text>
              </View>
            )}
          </View>
        )}

        {/* TAB 4: PRETTY IDS */}
        {activeTab === 'pretty_id' && (
          <View style={styles.section}>
            <View style={styles.bannerCard}>
              <Text style={styles.bannerBadge}>✨ EXCLUSIVE DIGITS</Text>
              <Text style={styles.bannerTitle}>Custom & Pretty IDs</Text>
              <Text style={styles.bannerSubtitle}>
                Replace your random user ID with memorable rare numbers (e.g. 8888, 7777).
              </Text>
            </View>

            {loadingFancyIds ? (
              <ActivityIndicator size="large" color={colors.gold.primary} style={{ marginTop: 40 }} />
            ) : fancyIds && fancyIds.length > 0 ? (
              fancyIds.map((item: any) => (
                <View key={item.id} style={styles.fancyIdRow}>
                  <View style={styles.idNumberBox}>
                    <Text style={styles.idNumberText}>ID: {item.pretty_id}</Text>
                  </View>
                  <Text style={styles.idPrice}>🪙 {formatNumber(item.price)}</Text>
                  <Button
                    title="Claim ID"
                    variant="gold"
                    size="sm"
                    loading={buyFancyIdMutation.isPending}
                    onPress={() => buyFancyIdMutation.mutate(item.id)}
                  />
                </View>
              ))
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🔢</Text>
                <Text style={styles.emptyTitle}>No Pretty IDs Available</Text>
                <Text style={styles.emptyDesc}>All rare numbers have been claimed. Check back later!</Text>
              </View>
            )}
          </View>
        )}

        {/* TAB 5: BACKPACK / MY ITEMS */}
        {activeTab === 'inventory' && (
          <View style={styles.section}>
            {user?.items && user.items.length > 0 ? (
              <View style={styles.itemsGrid}>
                {user.items.map((inv: any) => (
                  <View key={inv.id} style={styles.itemCard}>
                    <View style={styles.itemIconBox}>
                      <Text style={styles.itemIconEmoji}>{inv.icon || '🎁'}</Text>
                    </View>
                    <Text style={styles.itemName} numberOfLines={1}>{inv.name}</Text>
                    <Text style={styles.itemType}>
                      {inv.equipped ? '✅ EQUIPPED' : 'IN BACKPACK'}
                    </Text>
                    <Button
                      title={inv.equipped ? 'Unequip' : 'Equip'}
                      variant={inv.equipped ? 'outline' : 'gold'}
                      size="sm"
                      loading={equipItemMutation.isPending}
                      onPress={() =>
                        equipItemMutation.mutate({
                          userItemId: inv.id,
                          equip: !inv.equipped,
                        })
                      }
                      style={styles.itemBuyBtn}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🎒</Text>
                <Text style={styles.emptyTitle}>Backpack is Empty</Text>
                <Text style={styles.emptyDesc}>
                  You haven't purchased any mounts, frames, or entry effects yet.
                </Text>
              </View>
            )}
          </View>
        )}
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  balanceCoinIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  balanceText: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    marginRight: 4,
  },
  plusSign: {
    color: colors.gold.primary,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tabItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginRight: 6,
    borderRadius: radii.md,
  },
  tabItemActive: {
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    borderBottomWidth: 2,
    borderBottomColor: colors.gold.primary,
  },
  tabLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: typography.weights.medium,
  },
  tabLabelActive: {
    color: colors.gold.light,
    fontWeight: typography.weights.bold,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  section: {
    gap: spacing.md,
  },
  bannerCard: {
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  nobleBanner: {
    borderColor: 'rgba(147, 51, 234, 0.4)',
    backgroundColor: '#18122B',
  },
  bannerBadge: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    color: colors.gold.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
  },
  vipCard: {
    backgroundColor: '#0F172A',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  vipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  vipLevelBadge: {
    backgroundColor: colors.gold.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginRight: spacing.sm,
  },
  vipLevelText: {
    color: '#000000',
    fontWeight: typography.weights.heavy,
    fontSize: 11,
  },
  vipTitleCol: {
    flex: 1,
  },
  vipName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  vipDuration: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: typography.sizes.xs,
  },
  vipPrice: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  vipPerksText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: typography.sizes.xs,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  cardBtn: {
    marginTop: 4,
  },
  nobleCard: {
    backgroundColor: '#16192B',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.25)',
  },
  nobleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  nobleTitleEmoji: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
  },
  cashbackBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  cashbackText: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: typography.weights.bold,
  },
  noblePerk: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: typography.sizes.xs,
    marginVertical: spacing.xs,
    lineHeight: 18,
  },
  nobleBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  noblePrice: {
    color: colors.gold.light,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  itemCard: {
    width: '48%',
    backgroundColor: '#0F172A',
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  itemIconBox: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  itemIconEmoji: {
    fontSize: 32,
  },
  itemName: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
    marginBottom: 2,
  },
  itemType: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    marginBottom: 6,
  },
  itemPrice: {
    color: colors.gold.light,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs,
    marginBottom: 8,
  },
  itemBuyBtn: {
    width: '100%',
  },
  fancyIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
  },
  idNumberBox: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.gold.border,
  },
  idNumberText: {
    color: colors.gold.light,
    fontWeight: typography.weights.heavy,
    fontSize: typography.sizes.md,
  },
  idPrice: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

