import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button } from '../../src/components/ui';

export default function MaintenanceModal() {
  const handleRetry = () => {
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <Text style={styles.icon}>🛠️</Text>
        </View>
        <Text style={styles.title}>System Maintenance</Text>
        <Text style={styles.description}>
          Our platform is currently undergoing scheduled maintenance to upgrade streaming servers and security. Please check back shortly.
        </Text>
        <Button
          title="Retry Connection"
          variant="gold"
          size="md"
          onPress={handleRetry}
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
    borderColor: colors.gold.primary,
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

