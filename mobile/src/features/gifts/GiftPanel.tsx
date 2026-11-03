import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { colors, typography, radii, spacing } from '../../theme';
import { Sheet, Button } from '../../components/ui';
import { walletApi } from '../../api/endpoints';
import { Gift } from '../../api/types';
import { useAuthStore } from '../../stores/authStore';
import { formatNumber } from '../../utils/formatters';
import { resolveUrl } from '../../api/client';

interface GiftPanelProps {
  visible: boolean;
  roomId?: number;
  receiverId: number;
  onClose: () => void;
  onNeedRecharge?: () => void;
}

const CATEGORIES = ['All', 'Luxury', 'VIP', 'Lucky'];

export const GiftPanel: React.FC<GiftPanelProps> = ({
  visible,
  roomId,
  receiverId,
  onClose,
  onNeedRecharge,
}) => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const [comboCountdown, setComboCountdown] = useState(0);

  const comboTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: gifts = [] } = useQuery({
    queryKey: ['gifts_list'],
    queryFn: () => walletApi.getGifts(),
    enabled: visible,
  });

  const filteredGifts = gifts.filter((g) => {
    if (selectedCategory === 'All') return true;
    return g.category.toLowerCase() === selectedCategory.toLowerCase();
  });

  useEffect(() => {
    if (filteredGifts.length > 0 && !selectedGift) {
      setSelectedGift(filteredGifts[0]);
    }
  }, [filteredGifts, selectedGift]);

  // Combo timer countdown
  useEffect(() => {
    if (comboCountdown > 0) {
      const timer = setTimeout(() => {
        setComboCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (comboCountdown === 0 && comboCount > 0) {
      setComboCount(0);
    }
  }, [comboCountdown, comboCount]);

  const handleSendGift = async () => {
    if (!selectedGift) return;

    const cost = selectedGift.price;
    const currentCoins = user?.coins || 0;

    if (currentCoins < cost) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {}
      if (onNeedRecharge) onNeedRecharge();
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // 1. Optimistically deduct coins
    updateUser({ coins: currentCoins - cost });

    // 2. Increment combo
    const nextCombo = comboCount + 1;
    setComboCount(nextCombo);
    setComboCountdown(3); // 3-second combo window

    // 3. Send gift to server
    try {
      await walletApi.sendGift({
        receiver_id: receiverId,
        gift_id: selectedGift.id,
        qty: 1,
        context: 'room',
        room_id: roomId,
      });
    } catch (err: any) {
      console.warn('[GiftPanel] Send failed:', err?.message);
    }
  };

  const renderGiftItem = ({ item }: { item: Gift }) => {
    const isSelected = selectedGift?.id === item.id;
    const iconUrl = resolveUrl(item.icon);

    return (
      <TouchableOpacity
        style={[styles.giftCard, isSelected && styles.giftCardSelected]}
        onPress={() => {
          setSelectedGift(item);
          setComboCount(0);
        }}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: iconUrl }}
          style={styles.giftIcon}
          contentFit="contain"
        />
        <Text style={styles.giftName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceCoinIcon}>🪙</Text>
          <Text style={styles.priceText}>{formatNumber(item.price)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Luxury Gifts">
      {/* Categories Tabs */}
      <View style={styles.tabRow}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.tab, isSelected && styles.tabActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[styles.tabText, isSelected && styles.tabTextActive]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Gifts Grid */}
      <FlatList
        data={filteredGifts}
        renderItem={renderGiftItem}
        keyExtractor={(item) => String(item.id)}
        numColumns={4}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContent}
        style={styles.list}
      />

      {/* Footer / Send / Combo Bar */}
      <View style={styles.footer}>
        <View style={styles.balanceInfo}>
          <Text style={styles.balanceLabel}>Coins:</Text>
          <Text style={styles.balanceCoin}>🪙</Text>
          <Text style={styles.balanceAmount}>
            {formatNumber(user?.coins || 0)}
          </Text>
          {onNeedRecharge && (
            <TouchableOpacity
              style={styles.rechargeBtn}
              onPress={onNeedRecharge}
            >
              <Text style={styles.rechargeText}>+ Recharge</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Combo Button vs Normal Send */}
        {comboCount > 0 ? (
          <TouchableOpacity
            style={styles.comboButton}
            onPress={handleSendGift}
            activeOpacity={0.8}
          >
            <Text style={styles.comboMultiplier}>x{comboCount}</Text>
            <Text style={styles.comboLabel}>COMBO ({comboCountdown}s)</Text>
          </TouchableOpacity>
        ) : (
          <Button
            title="Send"
            variant="gold"
            size="sm"
            onPress={handleSendGift}
            style={styles.sendBtn}
          />
        )}
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.full,
    marginRight: spacing.sm,
    backgroundColor: colors.background.elevated,
  },
  tabActive: {
    backgroundColor: colors.gold.primary,
  },
  tabText: {
    color: colors.text.muted,
    fontSize: 12,
    fontWeight: typography.weights.semibold,
  },
  tabTextActive: {
    color: '#07090E',
    fontWeight: typography.weights.bold,
  },
  list: {
    height: 250,
  },
  gridContent: {
    paddingBottom: spacing.sm,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  giftCard: {
    width: '23%',
    backgroundColor: colors.background.elevated,
    borderRadius: radii.lg,
    padding: spacing.xs,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  giftCardSelected: {
    borderColor: colors.gold.primary,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
  giftIcon: {
    width: 44,
    height: 44,
    marginBottom: 2,
  },
  giftName: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: typography.weights.semibold,
    textAlign: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  priceCoinIcon: {
    fontSize: 9,
    marginRight: 2,
  },
  priceText: {
    color: colors.gold.light,
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    marginTop: spacing.xs,
  },
  balanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceLabel: {
    color: colors.text.muted,
    fontSize: 12,
    marginRight: 4,
  },
  balanceCoin: {
    fontSize: 12,
    marginRight: 2,
  },
  balanceAmount: {
    color: colors.gold.light,
    fontSize: 13,
    fontWeight: typography.weights.bold,
  },
  rechargeBtn: {
    marginLeft: spacing.sm,
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  rechargeText: {
    color: colors.gold.light,
    fontSize: 11,
    fontWeight: typography.weights.bold,
  },
  sendBtn: {
    minWidth: 80,
  },
  comboButton: {
    backgroundColor: colors.gold.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gold.bright,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  comboMultiplier: {
    color: '#07090E',
    fontSize: 14,
    fontWeight: typography.weights.heavy,
  },
  comboLabel: {
    color: '#07090E',
    fontSize: 8,
    fontWeight: typography.weights.heavy,
  },
});

