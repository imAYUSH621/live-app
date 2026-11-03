import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button } from '../../src/components/ui';

export default function BannedModal() {
  const handleContactSupport = () => {
    Linking.openURL('mailto:support@yourdomain.com?subject=Account%20Appeal');
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>⛔</Text>
        </View>
        <Text style={styles.title}>Account or Device Suspended</Text>
        <Text style={styles.description}>
          Your access to the platform has been restricted due to violations of our Community Guidelines or Terms of Service.
        </Text>
        <Button
          title="Contact Support & Appeal"
          variant="gold"
          size="md"
          onPress={handleContactSupport}
          style={styles.btn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.feedback.error,
    padding: spacing.xxl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  iconBox: {
    marginBottom: spacing.md,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    color: colors.text.muted,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    lineHeight: typography.lineHeights.sm,
    marginBottom: spacing.xl,
  },
  btn: {
    width: '100%',
  },
});

