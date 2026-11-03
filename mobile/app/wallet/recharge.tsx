import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast, EmptyState } from '../../src/components/ui';
import { walletApi } from '../../src/api/endpoints';
import { RechargePackage } from '../../src/api/types';
import { useAuthStore } from '../../src/stores/authStore';
import { formatNumber } from '../../src/utils/formatters';

export default function RechargeScreen() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [selectedPkg, setSelectedPkg] = useState<RechargePackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isPlayBillingEnabled =
    process.env.EXPO_PUBLIC_ENABLE_PLAY_BILLING === 'true';

  const packagesQuery = useQuery({
    queryKey: ['recharge_packages'],
    queryFn: () => walletApi.getRechargePackages('android'),
  });

  const packages = packagesQuery.data?.packages || [];
  const isFirstRecharge = packagesQuery.data?.first_recharge ?? true;

  const handlePurchase = async () => {
    if (!selectedPkg) {
      setToastMessage('Please select a recharge package');
      return;
    }

    setLoading(true);
    try {
      if (isPlayBillingEnabled) {
        // Flagged requirement: Google Play Billing verification requires a dedicated server verify endpoint.
        Alert.alert(
          'Google Play Billing',
          'Google Play Billing is active. Server requires backend verification endpoint: POST /api/recharge/google-play/verify',
          [{ text: 'OK' }]
        );
        setLoading(false);
        return;
      }

      // Standard Razorpay order flow
      const orderRes = await walletApi.createRechargeOrder(selectedPkg.id);

      // In production development builds, razorpay checkout modal opens with orderRes
      Alert.alert(
        'Confirm Recharge Order',
        `Recharge ${formatNumber(selectedPkg.coins)} coins for ${selectedPkg.currency} ${selectedPkg.price}?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setLoading(false) },
          {
            text: 'Simulate Payment Success',
            onPress: async () => {
              try {
                // Verify order with backend
                const verifyRes = await walletApi.verifyRechargeOrder(
                  orderRes.order_id,
                  `pay_mock_${Date.now()}`,
                  'sig_mock_signature'
                );
                updateUser({ coins: verifyRes.coins });
                setToastMessage(`Recharged ${verifyRes.credited} coins successfully!`);
              } catch (e: any) {
                // If signature verification strictly checked on server
                setToastMessage('Order created: ' + (orderRes.razorpay_order_id || orderRes.order_id));
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    } catch (err: any) {
      setToastMessage(err?.message || 'Failed to initiate payment');
      setLoading(false);
    }
  };

  const renderPackageItem = ({ item }: { item: RechargePackage }) => {
    const isSelected = selectedPkg?.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.packageCard, isSelected && styles.packageCardSelected]}
        onPress={() => setSelectedPkg(item)}
        activeOpacity={0.85}
      >
        {isFirstRecharge && item.first_bonus > 0 ? (
          <View style={styles.bonusTag}>
            <Text style={styles.bonusTagText}>+{item.first_bonus} BONUS</Text>
          </View>
        ) : item.bonus > 0 ? (
          <View style={styles.bonusTag}>
            <Text style={styles.bonusTagText}>+{item.bonus} BONUS</Text>
          </View>
        ) : null}

        <View style={styles.coinsRow}>
          <Text style={styles.coinIcon}>🪙</Text>
          <Text style={styles.coinsAmount}>{formatNumber(item.coins)}</Text>
        </View>

        <Text style={styles.priceTag}>
          {item.currency === 'INR' ? '₹' : item.currency} {item.price}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recharge Coins</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Balance Header */}
        <View style={styles.userBalanceBox}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.coinLargeIcon}>🪙</Text>
            <Text style={styles.balanceLargeText}>
              {formatNumber(user?.coins || 0)}
            </Text>
          </View>
        </View>

        {/* Promo Banner if First Recharge */}
        {isFirstRecharge && (
          <View style={styles.promoBanner}>
            <Text style={styles.promoIcon}>🎁</Text>
            <View style={styles.promoDetails}>
              <Text style={styles.promoTitle}>First Recharge Double Bonus!</Text>
              <Text style={styles.promoSub}>
                Get extra bonus coins on your first recharge today.
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Select Package</Text>

        {/* Packages Grid */}
        <FlatList
          data={packages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPackageItem}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          scrollEnabled={false}
          ListEmptyComponent={
            !packagesQuery.isLoading ? (
              <EmptyState
                title="No Recharge Packages"
                description="Packages are being configured by official admin coin sellers."
              />
            ) : null
          }
        />
      </ScrollView>

      {/* Bottom Payment Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.selectedPriceInfo}>
          <Text style={styles.selectedPriceLabel}>Total Amount:</Text>
          <Text style={styles.selectedPriceValue}>
            {selectedPkg
              ? `${selectedPkg.currency === 'INR' ? '₹' : selectedPkg.currency} ${selectedPkg.price}`
              : 'Select package'}
          </Text>
        </View>

        <Button
          title={isPlayBillingEnabled ? 'Pay with Google Play' : 'Pay Online'}
          variant="gold"
          size="lg"
          loading={loading}
          disabled={!selectedPkg}
          onPress={handlePurchase}
          style={styles.payBtn}
        />
      </View>

      <Toast
        visible={!!toastMessage}
        message={toastMessage || ''}
        type="info"
        onHide={() => setToastMessage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: {
    color: colors.gold.light,
    fontSize: 22,
    fontWeight: typography.weights.bold,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: 90,
  },
  userBalanceBox: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    color: colors.text.muted,
    fontSize: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  coinLargeIcon: {
    fontSize: 26,
    marginRight: spacing.sm,
  },
  balanceLargeText: {
    color: colors.gold.light,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.heavy,
  },
  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gold.primary,
    marginBottom: spacing.lg,
  },
  promoIcon: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  promoDetails: {
    flex: 1,
  },
  promoTitle: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  promoSub: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.md,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  packageCard: {
    width: '48.5%',
    backgroundColor: colors.background.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    position: 'relative',
    height: 120,
  },
  packageCardSelected: {
    borderColor: colors.gold.primary,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
  },
  bonusTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.gold.primary,
    borderRadius: radii.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bonusTagText: {
    color: '#07090E',
    fontSize: 9,
    fontWeight: typography.weights.heavy,
  },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  coinIcon: {
    fontSize: 20,
    marginRight: 6,
  },
  coinsAmount: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.heavy,
  },
  priceTag: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  selectedPriceInfo: {
    flex: 1,
  },
  selectedPriceLabel: {
    color: colors.text.muted,
    fontSize: 11,
  },
  selectedPriceValue: {
    color: colors.gold.light,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  payBtn: {
    minWidth: 160,
  },
});

