import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionTitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  actionTitle,
  actionLabel,
  onAction,
  style,
}) => {
  const label = actionLabel || actionTitle;
  return (
    <View style={[styles.container, style]}>
      {icon && <View style={styles.iconBox}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {label && onAction && (
        <Button
          title={label}
          onPress={onAction}
          variant="gold"
          size="sm"
          style={styles.actionBtn}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconBox: {
    marginBottom: spacing.md,
    opacity: 0.85,
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    color: colors.text.muted,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    lineHeight: typography.lineHeights.sm,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    marginTop: spacing.xs,
  },
});

