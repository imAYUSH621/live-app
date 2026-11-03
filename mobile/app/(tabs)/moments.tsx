import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { momentsApi } from '../../src/api/endpoints';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Avatar, Badge, EmptyState, Toast } from '../../src/components/ui';
import { formatTimeAgo } from '../../src/utils/formatters';

type Tab = 'latest' | 'hot' | 'following' | 'nearby';

export default function MomentsScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('latest');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const {
    data: moments,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['moments', activeTab],
    queryFn: () => momentsApi.getMoments(activeTab),
  });

  const likeMutation = useMutation({
    mutationFn: (id: number) => momentsApi.likeMoment(id),
    onSuccess: (res, momentId) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
      queryClient.setQueryData(['moments', activeTab], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((m) =>
          m.id === momentId ? { ...m, liked: res.liked, likes: res.likes } : m
        );
      });
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to like moment');
    },
  });

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.momentCard}>
      {/* Author info */}
      <View style={styles.cardHeader}>
        <Avatar
          url={item.user?.avatar_url}
          name={item.user?.name}
          size={42}
          vipLevel={item.user?.vip_level}
        />
        <View style={styles.authorCol}>
          <View style={styles.nameRow}>
            <Text style={styles.authorName}>{item.user?.name || 'Anonymous'}</Text>
            {item.user?.noble_level > 0 && (
              <Badge label={`Noble ${item.user.noble_level}`} variant="gold" size="sm" />
            )}
          </View>
          <Text style={styles.timeAgo}>{formatTimeAgo(item.created_at)}</Text>
        </View>
      </View>

      {/* Body text */}
      {item.body ? <Text style={styles.bodyText}>{item.body}</Text> : null}

      {/* Media image */}
      {item.media_url ? (
        <Image
          source={{ uri: item.media_url }}
          style={styles.momentImage}
          resizeMode="cover"
        />
      ) : null}

      {/* Card Footer / Actions */}
      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => likeMutation.mutate(item.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.actionIcon}>{item.liked ? '❤️' : '🤍'}</Text>
          <Text style={[styles.actionCount, item.liked && styles.actionCountLiked]}>
            {item.likes || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{item.comments || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8}>
          <Text style={styles.actionIcon}>🎁</Text>
          <Text style={styles.actionCount}>{item.gifts_coins || 0}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Moments</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/moments/create' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.createBtnText}>+ Post</Text>
        </TouchableOpacity>
      </View>

      {/* Feed Tabs */}
      <View style={styles.tabBar}>
        {(['latest', 'hot', 'following', 'nearby'] as Tab[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Feed List */}
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.gold.primary} />
        </View>
      ) : moments && moments.length > 0 ? (
        <FlatList
          data={moments}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
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
          icon={<Text style={{ fontSize: 44 }}>✨</Text>}
          title="No Moments Here"
          description="Be the first to share an update, photo or memory!"
          actionLabel="Post a Moment"
          onAction={() => router.push('/moments/create' as any)}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
  },
  createBtn: {
    backgroundColor: colors.gold.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
  },
  createBtnText: {
    color: '#000000',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tabItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.sm,
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.gold.primary,
  },
  tabLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: typography.weights.medium,
  },
  tabLabelActive: {
    color: colors.gold.light,
    fontWeight: typography.weights.bold,
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 40,
  },
  momentCard: {
    backgroundColor: '#0F172A',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  authorCol: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  timeAgo: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: typography.sizes.xs,
    marginTop: 2,
  },
  bodyText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  momentImage: {
    width: '100%',
    height: 220,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionCount: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: typography.sizes.xs,
  },
  actionCountLiked: {
    color: '#EC4899',
    fontWeight: typography.weights.bold,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
