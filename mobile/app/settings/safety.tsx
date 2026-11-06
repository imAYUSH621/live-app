import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { safetyApi, supportApi, SafetyState } from '../../src/api/endpoints';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';
import { formatNumber } from '../../src/utils/formatters';

const money = (o: { currency: string; amount: number }) =>
  o.currency && o.currency !== 'INR'
    ? `${o.currency} ${Number(o.amount).toLocaleString('en-IN')}`
    : `₹${Number(o.amount).toLocaleString('en-IN')}`;

export default function SafetyScreen() {
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: safety, isLoading } = useQuery({
    queryKey: ['safety'],
    queryFn: () => safetyApi.getSafety(),
  });
  const { data: tickets } = useQuery({
    queryKey: ['support_tickets'],
    queryFn: () => supportApi.listTickets(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['safety'] });
    queryClient.invalidateQueries({ queryKey: ['support_tickets'] });
  };

  const saveLimit = async () => {
    setBusy(true);
    try {
      const coins = Number(limit ?? '') || 0;
      const r = await safetyApi.setDailyLimit(coins);
      setToastMessage(
        r.pendingLimit
          ? `New limit of ${formatNumber(r.pendingLimit)} coins applies after the waiting period`
          : r.dailyLimit
            ? `Daily gift limit set to ${formatNumber(r.dailyLimit)} coins`
            : 'Daily limit removed',
      );
      refresh();
    } catch (e: any) {
      setToastMessage(e?.message || 'Could not save limit');
    }
    setBusy(false);
  };

  const requestRefund = (o: SafetyState['orders'][number]) => {
    Alert.alert(
      'Request refund',
      `Ask for a refund of order #${o.id} (${formatNumber(o.coins)} coins)? The coins are held while the team reviews it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request refund',
          onPress: async () => {
            try {
              await safetyApi.requestRefund(o.id);
              setToastMessage('Refund requested. The coins are held until it is reviewed.');
              refresh();
            } catch (e: any) {
              setToastMessage(e?.message || 'Could not request refund');
            }
          },
        },
      ],
    );
  };

  const sendTicket = async () => {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await supportApi.createTicket(subject.trim(), body.trim());
      setToastMessage('Support request sent. We will reply here.');
      setSubject('');
      setBody('');
      refresh();
    } catch (e: any) {
      setToastMessage(e?.message || 'Could not send request');
    }
    setBusy(false);
  };

  const limitValue = limit ?? (safety?.dailyLimit ? String(safety.dailyLimit) : '');

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safety & Refunds</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Daily gift limit */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DAILY GIFT LIMIT</Text>
            {safety && (
              <>
                <Text style={styles.desc}>
                  {safety.dailyLimit > 0
                    ? `Limit ${formatNumber(safety.dailyLimit)} coins/day · used ${formatNumber(safety.spentToday)} today.`
                    : `No daily limit set · used ${formatNumber(safety.spentToday)} coins today.`}
                  {safety.pendingLimit != null &&
                    ` A higher limit of ${formatNumber(safety.pendingLimit)} applies ${
                      safety.pendingAt
                        ? new Date(safety.pendingAt).toLocaleString('en-IN')
                        : 'after the waiting period'
                    }.`}
                </Text>
                <View style={styles.rowGap}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    keyboardType="number-pad"
                    placeholder="Coins per day (0 = no limit)"
                    placeholderTextColor={colors.text.muted}
                    value={limitValue}
                    onChangeText={setLimit}
                  />
                  <Button title={busy ? 'Saving…' : 'Save'} onPress={saveLimit} disabled={busy} />
                </View>
                <Text style={styles.hint}>
                  Lowering applies right away. Raising applies after a waiting period.
                </Text>
              </>
            )}
          </View>

          {/* Refunds */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>REFUNDS</Text>
            <Text style={styles.desc}>
              Made a recharge by mistake? You can ask for a refund within{' '}
              {safety?.refundWindowHours ?? 72} hours if the coins are still in your wallet.
            </Text>
            {!safety || safety.orders.length === 0 ? (
              <Text style={styles.hint}>No recent recharges.</Text>
            ) : (
              safety.orders.map((o) => (
                <View key={o.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {money(o)} · {formatNumber(o.coins)} coins
                    </Text>
                    <Text style={styles.hint}>
                      Order #{o.id} · {new Date(o.at).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {o.refundStatus ? (
                    <Text style={styles.statusChip}>refund {o.refundStatus}</Text>
                  ) : o.canRefund ? (
                    <TouchableOpacity onPress={() => requestRefund(o)}>
                      <Text style={styles.refundLink}>Refund</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.statusChip}>{o.status}</Text>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Support */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SUPPORT</Text>
            <TextInput
              style={styles.input}
              placeholder="Subject"
              placeholderTextColor={colors.text.muted}
              value={subject}
              maxLength={100}
              onChangeText={setSubject}
            />
            <TextInput
              style={[styles.input, { height: 90, marginTop: spacing.sm }]}
              placeholder="Describe the issue (include the order number for recharge problems)"
              placeholderTextColor={colors.text.muted}
              value={body}
              maxLength={2000}
              multiline
              onChangeText={setBody}
            />
            <View style={{ marginTop: spacing.sm }}>
              <Button
                title={busy ? 'Sending…' : 'Send to support'}
                onPress={sendTicket}
                disabled={busy || !subject.trim() || !body.trim()}
              />
            </View>
            {(tickets || []).map((tk) => (
              <View key={tk.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{tk.subject}</Text>
                  <Text style={styles.hint}>
                    {new Date(tk.created_at).toLocaleString('en-IN')}
                    {tk.reply ? ` · Reply: ${tk.reply}` : ''}
                  </Text>
                </View>
                <Text style={styles.statusChip}>{tk.status}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backArrow: { fontSize: 28, color: colors.text.primary },
  headerTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text.primary },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  section: {
    backgroundColor: colors.background.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.text.muted, marginBottom: spacing.sm },
  desc: { fontSize: typography.sizes.sm, color: colors.text.secondary, marginBottom: spacing.sm },
  hint: { fontSize: typography.sizes.xs, color: colors.text.muted, marginTop: spacing.xs },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    backgroundColor: colors.background.elevated,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.sizes.md,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
    gap: spacing.sm,
  },
  rowTitle: { fontSize: typography.sizes.sm, color: colors.text.primary },
  statusChip: { fontSize: typography.sizes.xs, color: colors.gold.primary },
  refundLink: { fontSize: typography.sizes.sm, color: colors.gold.primary, fontWeight: typography.weights.semibold },
});
