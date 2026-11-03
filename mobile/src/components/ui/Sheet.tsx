import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  ViewStyle,
} from 'react-native';
import { colors, typography, radii, spacing } from '../../theme';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}

export const Sheet: React.FC<SheetProps> = ({
  visible,
  onClose,
  title,
  children,
  contentStyle,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheetContent, contentStyle]}>
              <View style={styles.dragHandle} />
              {title && (
                <View style={styles.header}>
                  <Text style={styles.titleText}>{title}</Text>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.closeIcon}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {children}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: colors.background.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.sm,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.border.medium,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  titleText: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  closeIcon: {
    color: colors.text.muted,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
});

