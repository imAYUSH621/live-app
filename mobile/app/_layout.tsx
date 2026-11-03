import React, { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { registerGlobals } from '@livekit/react-native';
import { useAuthStore } from '../src/stores/authStore';
import { useCallStore } from '../src/stores/callStore';
import { setApiInterceptors } from '../src/api/client';
import { getSocket } from '../src/realtime/socket';
import { colors } from '../src/theme/colors';

// Initialize WebRTC and audio polyfills safely
try {
  registerGlobals();
} catch (e: any) {
  console.warn('[Root] registerGlobals skipped (likely running in Expo Go without native WebRTC):', e?.message);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

function RootNavigation() {
  const { user, token, isInitialized, isLoading } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    // Set up global error interception hooks
    setApiInterceptors({
      onUnauthorized: () => {
        useAuthStore.getState().logout();
        router.replace('/(auth)/login');
      },
      onBanned: () => {
        router.push('/modals/banned');
      },
      onMaintenance: () => {
        router.push('/modals/maintenance');
      },
    });
  }, []);

  // Listen for incoming 1v1 calls globally
  useEffect(() => {
    if (!token) return;

    let socketRef: any = null;
    (async () => {
      try {
        const socket = await getSocket();
        socketRef = socket;

        socket.on('call:incoming', (data: any) => {
          useCallStore.getState().setIncomingCall({
            callId: data.call_id,
            from: data.from,
            kind: data.kind || 'video',
            rate: data.rate || 0,
          });

          router.push({
            pathname: `/call/${data.call_id}` as any,
            params: {
              isIncoming: 'true',
              kind: data.kind || 'video',
            },
          });
        });
      } catch (e) {
        console.warn('[RootNavigation] Socket call listener error:', e);
      }
    })();

    return () => {
      if (socketRef) {
        socketRef.off('call:incoming');
      }
    };
  }, [token]);

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inModals = segments[0] === 'modals';

    if (!token && !inAuthGroup && !inModals) {
      // Redirect to login if unauthenticated
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      // Redirect to home tabs if already logged in
      router.replace('/(tabs)');
    }
  }, [token, isInitialized, segments]);

  if (!isInitialized || (isLoading && !user && token)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.gold.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background.base },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="live/[id]"
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="live/go-live"
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="call/[id]"
        options={{ headerShown: false, animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="modals/banned"
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
      <Stack.Screen
        name="modals/maintenance"
        options={{ presentation: 'transparentModal', animation: 'fade' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const initializeAuth = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={colors.background.base} />
        <RootNavigation />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
