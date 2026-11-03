import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Button, Avatar } from '../../components/ui';
import { colors, typography, radii, spacing } from '../../theme';
import { MiniProfile } from '../../api/types';
import { callsApi } from '../../api/endpoints';

interface CallRatingModalProps {
  visible: boolean;
  callId: number;
  peer: MiniProfile | null;
  durationSeconds: number;
  onFinish: () => void;
}

const TAGS = [
  'Friendly 😊',
  'Great Conversation 💬',
  'Crystal Clear 🔊',
  'Charming Star ⭐',
  'Helpful 🤝',
];

export const CallRatingModal: React.FC<CallRatingModalProps> = ({
  visible,
  callId,
  peer,
  durationSeconds,
  onFinish,
}) => {
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await callsApi.rateCall(callId, rating, selectedTags);
    } catch (e) {
      console.warn('[CallRating] Failed to rate:', e);
    } finally {
      setSubmitting(false);
      onFinish();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Avatar
            url={peer?.avatar_url}
            name={peer?.name}
            size={64}
            vipLevel={peer?.vip_level}
          />
          <Text style={styles.title}>How was your call?</Text>
          <Text style={styles.peerName}>with {peer?.name}</Text>

          {/* Star selector */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                style={styles.starBox}
              >
                <Text style={styles.starIcon}>
                  {star <= rating ? '⭐' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tags */}
          <View style={styles.tagsWrap}>
            {TAGS.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  style={[
                    styles.tagChip,
                    isSelected && styles.tagChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.tagText,
                      isSelected && styles.tagTextSelected,
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button
            title="Submit Feedback"
            variant="gold"
            size="md"
            loading={submitting}
            onPress={handleSubmit}
            style={styles.submitBtn}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 11, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    zIndex: 9999,
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radii.xxl,
    borderWidth: 1.5,
    borderColor: colors.gold.border,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginTop: spacing.md,
  },
  peerName: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    marginBottom: spacing.md,
  },
  starsRow: {
    flexDirection: 'row',
    marginVertical: spacing.md,
  },
  starBox: {
    padding: 6,
  },
  starIcon: {
    fontSize: 28,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  tagChip: {
    backgroundColor: colors.background.elevated,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    margin: 4,
  },
  tagChipSelected: {
    borderColor: colors.gold.primary,
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
  },
  tagText: {
    color: colors.text.muted,
    fontSize: 11,
  },
  tagTextSelected: {
    color: colors.gold.light,
    fontWeight: typography.weights.bold,
  },
  submitBtn: {
    width: '100%',
    marginTop: spacing.sm,
  },
});

