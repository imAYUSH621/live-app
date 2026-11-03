import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Avatar, Badge, EmptyState, Skeleton } from '../../src/components/ui';
import { discoverApi, liveApi } from '../../src/api/endpoints';
import { useAuthStore } from '../../src/stores/authStore';
import { formatNumber } from '../../src/utils/formatters';
import { resolveUrl } from '../../src/api/client';
import { LiveRoom } from '../../src/api/types';

const CATEGORIES = ['All', 'Popular', 'PK Battle', 'Music', 'Chat', 'Gaming'];

export default function HomeScreen() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const user = useAuthStore((s) => s.user);

  // Queries
  const homeQuery = useQuery({
    queryKey: ['home_feed'],
    queryFn: () => discoverApi.getHome(),
  });

  const roomsQuery = useQuery({
    queryKey: ['live_rooms', selectedCategory],
    queryFn: () =>
      liveApi.getRooms(selectedCategory === 'All' ? undefined : selectedCategory.toLowerCase()),
  });

  const isRefreshing = homeQuery.isRefetching || roomsQuery.isRefetching;

  const onRefresh = () => {
    homeQuery.refetch();
    roomsQuery.refetch();
  };

  const rooms: LiveRoom[] = roomsQuery.data || homeQuery.data?.rooms || [];
  const banners = homeQuery.data?.banners || [];

  const renderRoomItem = ({ item }: { item: LiveRoom }) => {
    const cover = item.cover_url ? resolveUrl(item.cover_url) : null;
    return (
      <TouchableOpacity
        style={styles.roomCard}
        activeOpacity={0.88}
        onPress={() => {
          // Live room navigation for Phase 2
          router.push(`/live/${item.id}` as any);
        }}
      >
        <View style={styles.roomCoverBox}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.coverPlaceholder]}>
              <Text style={styles.placeholderIcon}>📺</Text>
            </View>
          )}

          {/* Top Info Overlay */}
          <View style={styles.roomTopOverlay}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{item.category || 'Live'}</Text>
            </View>
            <View style={styles.viewerPill}>
              <Text style={styles.viewerDot}>●</Text>
              <Text style={styles.viewerText}>{formatNumber(item.viewer_count || 1)}</Text>
            </View>
          </View>

          {/* Bottom Info Overlay */}
          <View style={styles.roomBottomOverlay}>
            <View style={styles.hostRow}>
              <Avatar
                url={item.host?.avatar_url}
                name={item.host?.name || 'Host'}
                size={26}
                vipLevel={item.host?.vip_level}
              />
              <Text style={styles.hostName} numberOfLines={1}>
                {item.host?.name || 'Host'}
              </Text>
            </View>
            <Text style={styles.roomTitle} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Text style={styles.headerLogo}>LUXE</Text>
          <Text style={styles.headerDot}>✦</Text>
        </View>

        {/* User Balance Chips */}
        {user && (
          <View style={styles.balanceChip}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={styles.coinBalance}>{formatNumber(user.coins)}</Text>
          </View>
        )}
      </View>

      {/* Main Stream Feed */}
      <FlatList
        data={rooms}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRoomItem}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold.light}
            colors={[colors.gold.primary]}
          />
        }
        ListHeaderComponent={
          <>
            {/* Banner Carousel */}
            {banners.length > 0 && (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.bannerContainer}
              >
                {banners.map((b: any, idx: number) => (
                  <View key={b.id || idx} style={styles.bannerItem}>
                    <Image
                      source={{ uri: resolveUrl(b.image_url) }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                    <View style={styles.bannerGradient}>
                      <Text style={styles.bannerTitle}>{b.title}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Categories horizontal pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={[
                      styles.categoryTab,
                      isSelected && styles.categoryTabSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryTabText,
                        isSelected && styles.categoryTabTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          roomsQuery.isLoading ? (
            <View style={styles.loadingSkeletonBox}>
              <View style={styles.skeletonRow}>
                <Skeleton width="48%" height={180} borderRadius={radii.lg} />
                <Skeleton width="48%" height={180} borderRadius={radii.lg} />
              </View>
              <View style={[styles.skeletonRow, { marginTop: spacing.md }]}>
                <Skeleton width="48%" height={180} borderRadius={radii.lg} />
                <Skeleton width="48%" height={180} borderRadius={radii.lg} />
              </View>
            </View>
          ) : (
            <EmptyState
              title="No Live Streams Now"
              description="Be the first to start a broadcast and shine in front of thousands!"
              actionTitle="Go Live Now"
              onAction={() => router.push('/live/go-live' as any)}
            />
          )
        }
      />

      {/* Floating Go-Live Button */}
      <TouchableOpacity
        style={styles.floatingGoLive}
        activeOpacity={0.88}
        onPress={() => router.push('/live/go-live' as any)}
      >
        <Text style={styles.floatingIcon}>🎥</Text>
        <Text style={styles.floatingText}>GO LIVE</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.heavy,
    letterSpacing: 2,
  },
  headerDot: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    marginLeft: 4,
  },
  balanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.gold.border,
  },
  coinIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  coinBalance: {
    color: colors.gold.light,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  bannerContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  bannerItem: {
    width: 320,
    height: 120,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginRight: spacing.md,
    backgroundColor: colors.background.elevated,
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 9, 14, 0.45)',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  categoryScroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  categoryTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderRadius: radii.full,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginRight: spacing.sm,
  },
  categoryTabSelected: {
    backgroundColor: colors.gold.primary,
    borderColor: colors.gold.primary,
  },
  categoryTabText: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
  categoryTabTextSelected: {
    color: '#07090E',
    fontWeight: typography.weights.bold,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 80,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  roomCard: {
    width: '48.5%',
    height: 220,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.background.surface,
  },
  roomCoverBox: {
    flex: 1,
    position: 'relative',
  },
  coverPlaceholder: {
    backgroundColor: colors.background.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
    opacity: 0.5,
  },
  roomTopOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryPill: {
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  categoryPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  viewerDot: {
    color: colors.status.live,
    fontSize: 8,
    marginRight: 3,
  },
  viewerText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  roomBottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(7, 9, 14, 0.85)',
    padding: spacing.sm,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  hostName: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    marginLeft: 6,
    flex: 1,
  },
  roomTitle: {
    color: colors.text.secondary,
    fontSize: 11,
  },
  loadingSkeletonBox: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  floatingGoLive: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: colors.gold.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.full,
    shadowColor: colors.gold.bright,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  floatingIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  floatingText: {
    color: '#07090E',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.heavy,
    letterSpacing: 0.8,
  },
});

