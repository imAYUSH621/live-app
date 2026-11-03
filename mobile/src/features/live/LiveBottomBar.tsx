import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, typography, radii, spacing } from '../../theme';

interface LiveBottomBarProps {
  isHost?: boolean;
  isMuted?: boolean;
  onSendMessage: (text: string) => void;
  onSendLike: () => void;
  onOpenGifts: () => void;
  onOpenSeats: () => void;
  onToggleMute?: () => void;
  onFlipCamera?: () => void;
}

export const LiveBottomBar: React.FC<LiveBottomBarProps> = ({
  isHost = false,
  isMuted = false,
  onSendMessage,
  onSendLike,
  onOpenGifts,
  onOpenSeats,
  onToggleMute,
  onFlipCamera,
}) => {
  const [inputText, setInputText] = useState('');
  const [isInputActive, setIsInputActive] = useState(false);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText('');
    Keyboard.dismiss();
    setIsInputActive(false);
  };

  const handleLike = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onSendLike();
  };

  return (
    <View style={styles.container}>
      {/* Chat input pill */}
      <View style={[styles.inputPill, isInputActive && styles.inputPillActive]}>
        <TextInput
          style={styles.textInput}
          placeholder="Say something nice..."
          placeholderTextColor="rgba(255, 255, 255, 0.6)"
          value={inputText}
          onChangeText={setInputText}
          onFocus={() => setIsInputActive(true)}
          onBlur={() => setIsInputActive(false)}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        {inputText.trim().length > 0 && (
          <TouchableOpacity onPress={handleSend} style={styles.sendIconBox}>
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Host Controls */}
      {isHost && (
        <>
          {onFlipCamera && (
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={onFlipCamera}
              activeOpacity={0.8}
            >
              <Text style={styles.btnEmoji}>🔄</Text>
            </TouchableOpacity>
          )}

          {onToggleMute && (
            <TouchableOpacity
              style={[styles.circleBtn, isMuted && styles.circleBtnActive]}
              onPress={onToggleMute}
              activeOpacity={0.8}
            >
              <Text style={styles.btnEmoji}>{isMuted ? '🔇' : '🎙️'}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Seats button */}
      <TouchableOpacity
        style={styles.circleBtn}
        onPress={onOpenSeats}
        activeOpacity={0.8}
      >
        <Text style={styles.btnEmoji}>👥</Text>
      </TouchableOpacity>

      {/* Gift button */}
      <TouchableOpacity
        style={[styles.circleBtn, styles.giftBtn]}
        onPress={onOpenGifts}
        activeOpacity={0.8}
      >
        <Text style={styles.btnEmoji}>🎁</Text>
      </TouchableOpacity>

      {/* Heart Like button */}
      <TouchableOpacity
        style={[styles.circleBtn, styles.likeBtn]}
        onPress={handleLike}
        activeOpacity={0.8}
      >
        <Text style={styles.btnEmoji}>❤️</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    zIndex: 10,
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: spacing.sm,
  },
  inputPillActive: {
    borderColor: colors.gold.primary,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
  },
  sendIconBox: {
    paddingLeft: spacing.xs,
  },
  sendIcon: {
    color: colors.gold.light,
    fontSize: 16,
    fontWeight: typography.weights.bold,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginLeft: 6,
  },
  circleBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.6)',
    borderColor: colors.feedback.error,
  },
  giftBtn: {
    backgroundColor: 'rgba(212, 175, 55, 0.25)',
    borderColor: colors.gold.border,
  },
  likeBtn: {
    backgroundColor: 'rgba(236, 72, 153, 0.25)',
    borderColor: 'rgba(236, 72, 153, 0.5)',
  },
  btnEmoji: {
    fontSize: 18,
  },
});

