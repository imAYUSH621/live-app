import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [dataSaverEnabled, setDataSaverEnabled] = useState(false);
  const [audioOnlyLive, setAudioOnlyLive] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  const handleClearCache = () => {
    setToastMessage('App cache cleared successfully!');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Stream & Data Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STREAMING & NETWORK</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Data Saver Mode</Text>
              <Text style={styles.settingDesc}>
                Uses lower resolution video stream on cellular networks
              </Text>
            </View>
            <Switch
              value={dataSaverEnabled}
              onValueChange={setDataSaverEnabled}
              thumbColor={dataSaverEnabled ? colors.gold.primary : '#94A3B8'}
              trackColor={{ false: '#334155', true: 'rgba(212, 175, 55, 0.4)' }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Audio-Only Live Mode</Text>
              <Text style={styles.settingDesc}>
                Listen to live streams with camera feed turned off
              </Text>
            </View>
            <Switch
              value={audioOnlyLive}
              onValueChange={setAudioOnlyLive}
              thumbColor={audioOnlyLive ? colors.gold.primary : '#94A3B8'}
              trackColor={{ false: '#334155', true: 'rgba(212, 175, 55, 0.4)' }}
            />
          </View>
        </View>

        {/* Notifications & System */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS & FEEDBACK</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDesc}>
                Get notified when followed hosts go live or calls arrive
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              thumbColor={notificationsEnabled ? colors.gold.primary : '#94A3B8'}
              trackColor={{ false: '#334155', true: 'rgba(212, 175, 55, 0.4)' }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Haptic Feedback</Text>
              <Text style={styles.settingDesc}>
                Vibration effects for rapid gift combos and likes
              </Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              thumbColor={hapticsEnabled ? colors.gold.primary : '#94A3B8'}
              trackColor={{ false: '#334155', true: 'rgba(212, 175, 55, 0.4)' }}
            />
          </View>
        </View>

        {/* General Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APP & SYSTEM</Text>
          <TouchableOpacity style={styles.navRow} onPress={() => router.push('/settings/safety' as any)}>
            <Text style={styles.navLabel}>Safety & Refunds</Text>
            <Text style={styles.navDetail}>Daily limit, refunds, support ›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navRow} onPress={handleClearCache}>
            <Text style={styles.navLabel}>Clear Temporary Cache</Text>
            <Text style={styles.navDetail}>18.4 MB ›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navRow}
            onPress={() =>
              Alert.alert('LiveApp Platform', 'Version 1.0.0 (Build 5200)\nNative Android Edition')
            }
          >
            <Text style={styles.navLabel}>App Version</Text>
            <Text style={styles.navDetail}>1.0.0 ›</Text>
          </TouchableOpacity>
        </View>

        {/* Account Actions */}
        <Button
          title="Sign Out"
          variant="outline"
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
    gap: spacing.lg,
  },
  section: {
    backgroundColor: '#0F172A',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    color: colors.gold.primary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    marginBottom: 2,
  },
  settingDesc: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: typography.sizes.xs,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  navLabel: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  navDetail: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: typography.sizes.xs,
  },
  logoutBtn: {
    borderColor: 'rgba(239, 68, 68, 0.5)',
    marginTop: spacing.md,
  },
});

