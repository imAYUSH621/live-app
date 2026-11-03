import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { socialApi } from '../../src/api/endpoints';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Avatar, Badge, EmptyState } from '../../src/components/ui';
import { formatTimeAgo } from '../../src/utils/formatters';

export default function ChatsScreen() {
  const {
    data: chats,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['chats_list'],
    queryFn: () => socialApi.getChats(),
    refetchInterval: 10000,
  });

  const renderItem = ({ item }: { item: any }) => {
    const peer = item.user;
    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => router.push(`/chat/${item.other}` as any)}
        activeOpacity={0.7}
      >
        <Avatar
          url={peer?.avatar_url}
          name={peer?.name}
          size={50}
          vipLevel={peer?.vip_level}
        />
        <View style={styles.chatInfo}>
          <View style={styles.rowTop}>
            <View style={styles.nameRow}>
              <Text style={styles.peerName} numberOfLines={1}>
                {peer?.name || `User ${item.other}`}
              </Text>
              {peer?.noble_level > 0 && (
                <Badge label={`N${peer.noble_level}`} variant="gold" size="sm" />
              )}
            </View>
            <Text style={styles.timeAgo}>{formatTimeAgo(item.created_at)}</Text>
          </View>

          <View style={styles.rowBottom}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.body || (item.kind === 'image' ? '[Photo]' : '[Message]')}
            </Text>
            {item.unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      ) : chats && chats.length > 0 ? (
        <FlatList
          data={chats}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.other || item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.gold.primary}
            />
          }
        />
      ) : (
        <EmptyState
          icon={<Text style={{ fontSize: 44 }}>💬</Text>}
          title="No Messages Yet"
          description="Send direct messages to friends or receive notifications from hosts."
          actionLabel="Explore Live Streams"
          onAction={() => router.push('/(tabs)' as any)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
  },
  listContent: {
    paddingVertical: spacing.xs,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  chatInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  peerName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  timeAgo: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: typography.sizes.sm,
    flex: 1,
    marginRight: 8,
  },
  unreadBadge: {
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: typography.weights.heavy,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
