import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';
import { authApi } from '../../src/api/endpoints';
import { useAuthStore } from '../../src/stores/authStore';
import { getDeviceId } from '../../src/utils/device';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [referralCode, setReferralCode] = useState('');
  const [showReferral, setShowReferral] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSendOtp = async () => {
    const rawDigits = phone.replace(/\D/g, '');
    if (rawDigits.length < 10) {
      setToastMessage('Please enter a valid 10-digit phone number');
      return;
    }

    const fullPhone = `${countryCode}${rawDigits}`;
    setLoading(true);
    try {
      const res = await authApi.sendOtp(fullPhone);
      router.push({
        pathname: '/(auth)/otp-verify',
        params: {
          phone: fullPhone,
          devCode: res.dev_code || '',
          referralCode: referralCode.trim() || undefined,
        },
      });
    } catch (err: any) {
      setToastMessage(err?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await authApi.guestLogin({
        device_id: deviceId,
        referral_code: referralCode.trim() || undefined,
      });
      await setAuth(res.token, res.user);
      router.replace('/(tabs)');
    } catch (err: any) {
      setToastMessage(err?.message || 'Guest login failed');
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Branding */}
          <View style={styles.brandingBox}>
            <View style={styles.goldBadge}>
              <Text style={styles.goldBadgeText}>✦ LIVE PLATFORM ✦</Text>
            </View>
            <Text style={styles.logoTitle}>LUXE LIVE</Text>
            <Text style={styles.logoSubtitle}>
              Broadcast, Connect & Experience Luxury Live Streams
            </Text>
          </View>

          {/* Phone Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Sign In or Register</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>{countryCode}</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Enter phone number"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={setPhone}
                  editable={!loading && !guestLoading}
                />
              </View>
            </View>

            {/* Optional Referral Code Toggle */}
            <TouchableOpacity
              onPress={() => setShowReferral(!showReferral)}
              style={styles.referralToggle}
            >
              <Text style={styles.referralToggleText}>
                {showReferral ? '− Hide referral code' : '+ Have a referral code?'}
              </Text>
            </TouchableOpacity>

            {showReferral && (
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Referral Code (Optional)"
                  placeholderTextColor={colors.text.muted}
                  autoCapitalize="characters"
                  maxLength={12}
                  value={referralCode}
                  onChangeText={setReferralCode}
                  editable={!loading && !guestLoading}
                />
              </View>
            )}

            <Button
              title="Send Verification Code"
              variant="gold"
              size="lg"
              loading={loading}
              disabled={guestLoading}
              onPress={handleSendOtp}
              style={styles.sendButton}
            />

            <View style={styles.dividerBox}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Guest Login */}
            <Button
              title="Explore as Guest"
              variant="surface"
              size="md"
              loading={guestLoading}
              disabled={loading}
              onPress={handleGuestLogin}
            />
          </View>

          {/* Age Gate & Compliance */}
          <View style={styles.footerNotice}>
            <Text style={styles.noticeText}>
              By continuing, you confirm that you are at least{' '}
              <Text style={styles.highlightText}>18 years of age</Text> and agree to our{' '}
              <Text style={styles.linkText}>Terms of Service</Text> &{' '}
              <Text style={styles.linkText}>Privacy Policy</Text>.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast
        visible={!!toastMessage}
        message={toastMessage || ''}
        type="error"
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    justifyContent: 'center',
  },
  brandingBox: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  goldBadge: {
    backgroundColor: colors.gold.subtle,
    borderWidth: 1,
    borderColor: colors.gold.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radii.full,
    marginBottom: spacing.sm,
  },
  goldBadgeText: {
    color: colors.gold.light,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 1.2,
  },
  logoTitle: {
    color: '#FFFFFF',
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.heavy,
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  logoSubtitle: {
    color: colors.text.muted,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    lineHeight: typography.lineHeights.sm,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeader: {
    color: colors.text.primary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeBox: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  countryCodeText: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: radii.md,
    height: 48,
    paddingHorizontal: spacing.md,
    color: colors.text.primary,
    fontSize: typography.sizes.md,
  },
  textInput: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: radii.md,
    height: 46,
    paddingHorizontal: spacing.md,
    color: colors.text.primary,
    fontSize: typography.sizes.md,
  },
  referralToggle: {
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  referralToggleText: {
    color: colors.gold.light,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
  },
  sendButton: {
    marginTop: spacing.xs,
  },
  dividerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.subtle,
  },
  dividerText: {
    color: colors.text.muted,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    paddingHorizontal: spacing.md,
  },
  footerNotice: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  noticeText: {
    color: colors.text.muted,
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    lineHeight: typography.lineHeights.xs,
  },
  highlightText: {
    color: colors.text.secondary,
    fontWeight: typography.weights.bold,
  },
  linkText: {
    color: colors.gold.light,
    textDecorationLine: 'underline',
  },
});

