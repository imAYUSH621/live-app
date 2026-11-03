import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';
import { authApi } from '../../src/api/endpoints';
import { useAuthStore } from '../../src/stores/authStore';
import { getDeviceId } from '../../src/utils/device';

export default function OtpVerifyScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    devCode?: string;
    referralCode?: string;
  }>();

  const phone = params.phone || '';
  const devCode = params.devCode || '';
  const referralCode = params.referralCode;

  const [code, setCode] = useState(devCode);
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(60);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const handleVerify = async () => {
    if (code.length < 6) {
      setToastMessage('Please enter the full 6-digit verification code');
      return;
    }

    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await authApi.verifyOtp({
        phone,
        code,
        device_id: deviceId,
        referral_code: referralCode,
      });

      await setAuth(res.token, res.user);
      router.replace('/(tabs)');
    } catch (err: any) {
      setToastMessage(err?.message || 'Verification failed. Wrong or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    try {
      const res = await authApi.sendOtp(phone);
      if (res.dev_code) setCode(res.dev_code);
      setResendCountdown(60);
      setToastMessage('A new verification code has been sent');
    } catch (err: any) {
      setToastMessage(err?.message || 'Failed to resend code');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Change Number</Text>
          </TouchableOpacity>

          <View style={styles.headerBox}>
            <Text style={styles.title}>Verification Code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{' '}
              <Text style={styles.phoneHighlight}>{phone}</Text>
            </Text>
          </View>

          {/* Dev Code Banner if available in local test */}
          {devCode ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setCode(devCode)}
              style={styles.devBanner}
            >
              <Text style={styles.devBannerText}>
                ⚡ Development code detected: <Text style={styles.devCode}>{devCode}</Text> (Tap to fill)
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* OTP Input Card */}
          <View style={styles.card}>
            <TextInput
              style={styles.otpInput}
              placeholder="••••••"
              placeholderTextColor={colors.text.muted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              autoFocus
            />

            <Button
              title="Verify & Enter"
              variant="gold"
              size="lg"
              loading={loading}
              onPress={handleVerify}
              style={styles.verifyBtn}
            />

            <View style={styles.resendRow}>
              {resendCountdown > 0 ? (
                <Text style={styles.countdownText}>
                  Resend code in {resendCountdown}s
                </Text>
              ) : (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendLink}>Resend Code</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    justifyContent: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.xl,
  },
  backButtonText: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  headerBox: {
    marginBottom: spacing.xxl,
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.heavy,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.text.muted,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md,
  },
  phoneHighlight: {
    color: colors.gold.light,
    fontWeight: typography.weights.bold,
  },
  devBanner: {
    backgroundColor: colors.gold.subtle,
    borderWidth: 1,
    borderColor: colors.gold.border,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  devBannerText: {
    color: colors.gold.light,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textAlign: 'center',
  },
  devCode: {
    fontWeight: typography.weights.heavy,
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.xl,
  },
  otpInput: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1.5,
    borderColor: colors.gold.border,
    borderRadius: radii.lg,
    height: 58,
    textAlign: 'center',
    fontSize: 26,
    letterSpacing: 8,
    color: colors.gold.bright,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.xl,
  },
  verifyBtn: {
    marginBottom: spacing.lg,
  },
  resendRow: {
    alignItems: 'center',
  },
  countdownText: {
    color: colors.text.muted,
    fontSize: typography.sizes.sm,
  },
  resendLink: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    textDecorationLine: 'underline',
  },
});

