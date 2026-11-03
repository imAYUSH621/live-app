import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '../../src/api/endpoints';
import { getSocket } from '../../src/realtime/socket';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Avatar, Badge, Toast } from '../../src/components/ui';
import { formatTimeAgo } from '../../src/utils/formatters';

export default function DirectChatScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const peerId = Number(params.id);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [inputText, setInputText] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['chat', peerId],
    queryFn: () => socialApi.getChatMessages(peerId),
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) => socialApi.sendChatMessage(peerId, text),
    onSuccess: (newMsg) => {
      setInputText('');
      queryClient.setQueryData(['chat', peerId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: [...(old.messages || []), newMsg],
        };
      });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to send message');
    },
  });

  // Socket listener for real-time incoming messages
  useEffect(() => {
    let socket: any = null;
    (async () => {
      socket = await getSocket();
      socket.on('dm:new', (payload: any) => {
        if (payload?.from?.id === peerId && payload?.message) {
          queryClient.setQueryData(['chat', peerId], (old: any) => {
            if (!old) return old;
            return {
              ...old,
              messages: [...(old.messages || []), payload.message],
            };
          });
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      });
    })();

    return () => {
      if (socket) {
        socket.off('dm:new');
      }
    };
  }, [peerId]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    sendMutation.mutate(text);
  };

  const peer = data?.user;
  const messages = data?.messages || [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Avatar
          url={peer?.avatar_url}
          name={peer?.name}
          size={36}
          vipLevel={peer?.vip_level}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.peerName}>{peer?.name || `User ${peerId}`}</Text>
          <Text style={styles.peerStatus}>
            {peer?.status === 'online' ? '🟢 Online' : 'Active recently'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.callShortcutBtn}
          onPress={() => router.push(`/call/${peerId}?kind=video` as any)}
        >
          <Text style={styles.callShortcutText}>📹</Text>
        </TouchableOpacity>
      </View>

      {/* Messages Feed */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.gold.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            renderItem={({ item }) => {
              const isMine = item.from_id === user?.id;
              return (
                <View
                  style={[
                    styles.messageBubbleContainer,
                    isMine ? styles.myBubbleContainer : styles.peerBubbleContainer,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isMine ? styles.myBubble : styles.peerBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        isMine ? styles.myMessageText : styles.peerMessageText,
                      ]}
                    >
                      {item.body}
                    </Text>
                    <Text
                      style={[
                        styles.messageTime,
                        isMine ? styles.myMessageTime : styles.peerMessageTime,
                      ]}
                    >
                      {formatTimeAgo(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            disabled={!inputText.trim() || sendMutation.isPending}
            onPress={handleSend}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: {
    paddingRight: spacing.sm,
  },
  backArrow: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  peerName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  peerStatus: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: typography.sizes.xs,
  },
  callShortcutBtn: {
    padding: spacing.sm,
  },
  callShortcutText: {
    fontSize: 22,
  },
  messagesList: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  messageBubbleContainer: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  myBubbleContainer: {
    justifyContent: 'flex-end',
  },
  peerBubbleContainer: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.lg,
  },
  myBubble: {
    backgroundColor: colors.gold.primary,
    borderBottomRightRadius: 2,
  },
  peerBubble: {
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 2,
  },
  messageText: {
    fontSize: typography.sizes.sm,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#000000',
    fontWeight: typography.weights.medium,
  },
  peerMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myMessageTime: {
    color: 'rgba(0, 0, 0, 0.6)',
  },
  peerMessageTime: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0F172A',
  },
  input: {
    flex: 1,
    height: 42,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radii.full,
    backgroundColor: colors.gold.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendIcon: {
    color: '#000000',
    fontSize: 16,
    fontWeight: typography.weights.bold,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

