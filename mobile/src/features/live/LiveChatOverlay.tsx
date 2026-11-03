import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useChatStore, ChatMessage } from '../../stores/chatStore';
import { colors, typography, radii, spacing } from '../../theme';
import { Badge } from '../../components/ui';

export const LiveChatOverlay: React.FC = () => {
  const messages = useChatStore((s) => s.messages);
  const listRef = useRef<any>(null);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.type === 'enter') {
      return (
        <View style={styles.enterRow}>
          <Text style={styles.enterText}>
            👋 <Text style={styles.userNameText}>{item.user.name}</Text> joined the room
          </Text>
        </View>
      );
    }

    if (item.type === 'gift') {
      return (
        <View style={styles.giftRow}>
          <Text style={styles.giftText}>
            🎁 <Text style={styles.userNameText}>{item.user.name}</Text> sent{' '}
            <Text style={styles.giftHighlight}>{item.giftName}</Text> x{item.giftQty || 1}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.messageBubble}>
        <View style={styles.bubbleHeader}>
          <Badge type="wealth" level={item.user.wealth_level || 1} size="sm" />
          <Text style={styles.chatUserName} numberOfLines={1}>
            {item.user.name}
          </Text>
        </View>
        <Text style={styles.chatText}>{item.text}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <FlashList
        ref={listRef}
        data={messages}
        renderItem={renderItem}
        estimatedItemSize={52}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 220,
    width: '78%',
    justifyContent: 'flex-end',
  },
  listContent: {
    paddingVertical: spacing.xs,
  },
  messageBubble: {
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    marginBottom: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  chatUserName: {
    color: colors.gold.light,
    fontSize: 11,
    fontWeight: typography.weights.bold,
    marginLeft: 6,
  },
  chatText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
  },
  enterRow: {
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  enterText: {
    color: colors.gold.bright,
    fontSize: 11,
  },
  userNameText: {
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
  },
  giftRow: {
    backgroundColor: 'rgba(236, 72, 153, 0.25)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.4)',
  },
  giftText: {
    color: '#F472B6',
    fontSize: 12,
  },
  giftHighlight: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
  },
});

