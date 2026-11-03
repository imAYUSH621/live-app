import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  TextInput,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Sheet, Toast, EmptyState } from '../../src/components/ui';
import { walletApi, userApi } from '../../src/api/endpoints';
import { useAuthStore } from '../../src/stores/authStore';
import { formatNumber, formatRelativeTime } from '../../src/utils/formatters';

export default function WalletScreen() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [ledgerCurrency, setLedgerCurrency] = useState<'coin' | 'diamond'>('coin');
  const [showExchangeSheet, setShowExchangeSheet] = useState(false);
  const [diamondsToExchange, setDiamondsToExchange] = useState('');
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const walletQuery = useQuery({
    queryKey: ['wallet_details'],
    queryFn: () => walletApi.getWallet(),
  });

  const ledgerQuery = useQuery({
    queryKey: ['wallet_ledger', ledgerCurrency],
    queryFn: () => userApi.getLedger(ledgerCurrency),
  });

  const wallet = walletQuery.data || {
    coins: user?.coins || 0,
    diamonds: user?.diamonds || 0,
    exchange_rate: 1,
    min_exchange: 100,
    currency: 'INR',
  };

  const handleExchange = async () => {
    const d = parseInt(diamondsToExchange, 10);
    if (!d || d < wallet.min_exchange) {
      setToastMessage(`Minimum ${wallet.min_exchange} diamonds required`);
      return;
    }
    if (d > wallet.diamonds) {
      setToastMessage('Insufficient diamonds');
      return;
    }

    setExchangeLoading(true);
    try {
      const res = await walletApi.exchangeDiamonds(d);
      updateUser({ coins: res.coins, diamonds: res.diamonds });
      walletQuery.refetch();
      ledgerQuery.refetch();
      setShowExchangeSheet(false);
      setDiamondsToExchange('');
      setToastMessage(`Successfully exchanged ${d} diamonds for coins!`);
    } catch (err: any) {
      setToastMessage(err?.message || 'Exchange failed');
    } finally {
      setExchangeLoading(false);
    }
  };

  const renderLedgerItem = ({ item }: { item: any }) => {
    const isCredit = item.amount > 0;
    return (
      <View style={styles.ledgerRow}>
        <View style={styles.ledgerInfo}>
          <Text style={styles.ledgerType} numberOfLines={1}>
            {item.type.replace(/_/g, ' ').toUpperCase()}
          </Text>
          {item.note && <Text style={styles.ledgerNote}>{item.note}</Text>}
          <Text style={styles.ledgerTime}>{formatRelativeTime(item.created_at)}</Text>
        </View>
        <View style={styles.ledgerAmountBox}>
          <Text
            style={[
              styles.ledgerAmount,
              isCredit ? styles.amountPositive : styles.amountNegative,
            ]}
          >
            {isCredit ? `+${formatNumber(item.amount)}` : formatNumber(item.amount)}
          </Text>
          <Text style={styles.balanceAfter}>
            Bal: {formatNumber(item.balance_after)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={walletQuery.isRefetching || ledgerQuery.isRefetching}
            onRefresh={() => {
              walletQuery.refetch();
              ledgerQuery.refetch();
            }}
            tintColor={colors.gold.light}
          />
        }
      >
        {/* Balances Grid */}
        <View style={styles.balancesContainer}>
          {/* Gold Coins Card */}
          <View style={styles.coinCard}>
            <Text style={styles.cardCurrencyLabel}>Gold Coins</Text>
            <View style={styles.coinRow}>
              <Text style={styles.coinBigIcon}>🪙</Text>
              <Text style={styles.coinBigAmount}>{formatNumber(wallet.coins)}</Text>
            </View>
            <Button
              title="Recharge"
              variant="gold"
              size="sm"
              onPress={() => router.push('/wallet/recharge')}
              style={styles.cardActionBtn}
            />
          </View>

          {/* Diamonds Card */}
          <View style={styles.diamondCard}>
            <Text style={styles.cardCurrencyLabel}>Live Diamonds</Text>
            <View style={styles.coinRow}>
              <Text style={styles.diamondBigIcon}>💎</Text>
              <Text style={styles.diamondBigAmount}>{formatNumber(wallet.diamonds)}</Text>
            </View>
            <Button
              title="Exchange"
              variant="surface"
              size="sm"
              onPress={() => setShowExchangeSheet(true)}
              style={styles.cardActionBtn}
            />
          </View>
        </View>

        {/* Transaction Ledger Header */}
        <View style={styles.ledgerHeader}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          <View style={styles.currencyToggle}>
            <TouchableOpacity
              onPress={() => setLedgerCurrency('coin')}
              style={[
                styles.toggleBtn,
                ledgerCurrency === 'coin' && styles.toggleBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  ledgerCurrency === 'coin' && styles.toggleTextActive,
                ]}
              >
                🪙 Coins
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setLedgerCurrency('diamond')}
              style={[
                styles.toggleBtn,
                ledgerCurrency === 'diamond' && styles.toggleBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  ledgerCurrency === 'diamond' && styles.toggleTextActive,
                ]}
              >
                💎 Diamonds
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Ledger List */}
        <FlatList
          data={ledgerQuery.data || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderLedgerItem}
          scrollEnabled={false}
          ListEmptyComponent={
            !ledgerQuery.isLoading ? (
              <EmptyState
                title="No Transactions Yet"
                description="Your coin expenses, gifts, and recharge transactions will appear here."
              />
            ) : null
          }
        />
      </ScrollView>

      {/* Exchange Sheet Modal */}
      <Sheet
        visible={showExchangeSheet}
        onClose={() => setShowExchangeSheet(false)}
        title="Exchange Diamonds to Coins"
      >
        <View style={styles.exchangeBox}>
          <Text style={styles.exchangeRateNotice}>
            Rate: 1 Diamond = {wallet.exchange_rate} Coin (Min {wallet.min_exchange})
          </Text>

          <TextInput
            style={styles.exchangeInput}
            placeholder={`Enter diamonds (Available: ${wallet.diamonds})`}
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            keyboardType="number-pad"
            value={diamondsToExchange}
            onChangeText={setDiamondsToExchange}
          />

          {diamondsToExchange ? (
            <Text style={styles.receiveEstimate}>
              You will receive: 🪙{' '}
              {formatNumber(
                Math.floor(
                  (parseInt(diamondsToExchange, 10) || 0) * wallet.exchange_rate
                )
              )}{' '}
              Coins
            </Text>
          ) : null}

          <Button
            title="Confirm Exchange"
            variant="gold"
            size="lg"
            loading={exchangeLoading}
            onPress={handleExchange}
            style={styles.exchangeConfirmBtn}
          />
        </View>
      </Sheet>

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
  },
  balancesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  coinCard: {
    width: '48.5%',
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.gold.primary,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  diamondCard: {
    width: '48.5%',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  cardCurrencyLabel: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  coinBigIcon: {
    fontSize: 24,
    marginRight: 6,
  },
  diamondBigIcon: {
    fontSize: 24,
    marginRight: 6,
  },
  coinBigAmount: {
    color: colors.gold.bright,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.heavy,
  },
  diamondBigAmount: {
    color: '#38BDF8',
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.heavy,
  },
  cardActionBtn: {
    width: '100%',
  },
  ledgerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  currencyToggle: {
    flexDirection: 'row',
    backgroundColor: colors.background.elevated,
    borderRadius: radii.full,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  toggleBtnActive: {
    backgroundColor: colors.gold.primary,
  },
  toggleText: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: typography.weights.bold,
  },
  toggleTextActive: {
    color: '#07090E',
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  ledgerInfo: {
    flex: 1,
  },
  ledgerType: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  ledgerNote: {
    color: colors.gold.light,
    fontSize: 11,
    marginTop: 2,
  },
  ledgerTime: {
    color: colors.text.muted,
    fontSize: 10,
    marginTop: 2,
  },
  ledgerAmountBox: {
    alignItems: 'flex-end',
  },
  ledgerAmount: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.heavy,
  },
  amountPositive: {
    color: colors.feedback.success,
  },
  amountNegative: {
    color: colors.text.primary,
  },
  balanceAfter: {
    color: colors.text.muted,
    fontSize: 10,
    marginTop: 2,
  },
  exchangeBox: {
    paddingVertical: spacing.md,
  },
  exchangeRateNotice: {
    color: colors.gold.light,
    fontSize: typography.sizes.xs,
    marginBottom: spacing.md,
  },
  exchangeInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.medium,
    padding: spacing.md,
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    marginBottom: spacing.md,
  },
  receiveEstimate: {
    color: colors.gold.bright,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.lg,
  },
  exchangeConfirmBtn: {
    width: '100%',
  },
});

