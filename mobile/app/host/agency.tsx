import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { agencyApi, hostCenterApi } from '../../src/api/endpoints';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';

export default function AgencyScreen() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: centerData } = useQuery({
    queryKey: ['host_center'],
    queryFn: () => hostCenterApi.getHostCenter(),
  });
  const { data: invites } = useQuery({
    queryKey: ['agency_invites'],
    queryFn: () => agencyApi.myInvites(),
  });

  const host = centerData?.host;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['agency_invites'] });
    queryClient.invalidateQueries({ queryKey: ['host_center'] });
  };

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await agencyApi.joinByCode(code.trim().toUpperCase());
      setToastMessage('Joined the agency.');
      setCode('');
      refresh();
    } catch (e: any) {
      setToastMessage(e?.message || 'Could not join with that code');
    }
    setBusy(false);
  };

  const answer = async (id: number, action: 'accept' | 'decline') => {
    try {
      await agencyApi.answerInvite(id, action);
      setToastMessage(action === 'accept' ? 'Invite accepted.' : 'Invite declined.');
      refresh();
    } catch (e: any) {
      setToastMessage(e?.message || 'Could not answer the invite');
    }
  };

  const leave = () => {
    Alert.alert('Leave agency', 'You can leave 30 days after joining. Leave now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await agencyApi.leaveAgency();
            setToastMessage('You left the agency.');
            refresh();
          } catch (e: any) {
            setToastMessage(e?.message || 'Could not leave yet');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Agency</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MY AGENCY</Text>
          <Text style={styles.desc}>
            {host?.agency_name
              ? `You are in ${host.agency_name}. Agency commission is paid by the app, it is never cut from your diamonds.`
              : 'You are an independent host. Join an agency for managed support and events.'}
          </Text>
          {host?.agency_name ? (
            <Button title="Leave agency" variant="outline" onPress={leave} />
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Agency code"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="characters"
                value={code}
                onChangeText={setCode}
              />
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  title={busy ? 'Joining…' : 'Join with code'}
                  onPress={join}
                  disabled={busy || !code.trim()}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INVITES</Text>
          {!invites || invites.length === 0 ? (
            <Text style={styles.hint}>No open invites.</Text>
          ) : (
            invites.map((inv) => (
              <View key={inv.id} style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{inv.name}</Text>
                  <Text style={styles.hint}>Code {inv.code}</Text>
                </View>
                <TouchableOpacity onPress={() => answer(inv.id, 'accept')}>
                  <Text style={styles.acceptLink}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => answer(inv.id, 'decline')}>
                  <Text style={styles.declineLink}>Decline</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  section: {
    backgroundColor: colors.background.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.text.muted,
    marginBottom: spacing.sm,
  },
  desc: { fontSize: typography.sizes.sm, color: colors.text.secondary, marginBottom: spacing.sm },
  hint: { fontSize: typography.sizes.xs, color: colors.text.muted, marginTop: spacing.xs },
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
    gap: spacing.md,
  },
  rowTitle: { fontSize: typography.sizes.sm, color: colors.text.primary },
  acceptLink: {
    fontSize: typography.sizes.sm,
    color: colors.gold.primary,
    fontWeight: typography.weights.semibold,
  },
  declineLink: { fontSize: typography.sizes.sm, color: colors.text.muted },
});
