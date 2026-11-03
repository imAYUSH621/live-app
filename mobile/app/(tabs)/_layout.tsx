import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background.surface,
          borderTopColor: colors.border.subtle,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: spacing.xs,
          paddingTop: spacing.xs,
        },
        tabBarActiveTintColor: colors.gold.light,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarLabelStyle: {
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Live',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 20, color }}>
              {focused ? '🔥' : '📺'}
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="moments"
        options={{
          title: 'Moments',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 20, color }}>
              {focused ? '✨' : '🪐'}
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 20, color }}>
              {focused ? '💬' : '🗨️'}
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: 20, color }}>
              {focused ? '👑' : '👤'}
            </Text>
          ),
        }}
      />
    </Tabs>
  );
}

