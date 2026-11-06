import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType } from 'expo-camera';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';
import { requestLiveStreamPermissions } from '../../src/utils/permissions';
import { liveApi } from '../../src/api/endpoints';
import { liveKitService } from '../../src/realtime/livekit';
import { useLiveRoomStore } from '../../src/stores/liveRoomStore';
import { useAuthStore } from '../../src/stores/authStore';

const CATEGORIES = ['Chat', 'Music', 'PK Battle', 'Gaming', 'Dance', 'Lifestyle'];

export default function GoLiveScreen() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Chat');
  const [mode, setMode] = useState<'live' | 'audio'>('live');
  const [facing, setFacing] = useState<CameraType>('front');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const user = useAuthStore((st) => st.user);

  // Host verification gate (consistent with web GoLive): only approved hosts
  // may start a stream. Server-side enforcement comes from the
  // host_only_live setting; this screen is the user-facing gate.
  const hostStatus = user?.hostStatus ?? (user?.is_host || user?.isHost ? 'approved' : 'none');
  const isApprovedHost = Boolean(user?.verified && hostStatus === 'approved');

  useEffect(() => {
    (async () => {
      const granted = await requestLiveStreamPermissions();
      setPermissionGranted(granted);
    })();
  }, []);

  const handleStartStream = async () => {
    if (!isApprovedHost) {
      setToastMessage(
        hostStatus === 'pending'
          ? 'Your host verification is under review'
          : hostStatus === 'suspended'
            ? 'Your host account is suspended'
            : 'Complete host verification before going live'
      );
      return;
    }
    if (!title.trim()) {
      setToastMessage('Please enter a stream title');
      return;
    }

    setLoading(true);
    try {
      // 1. Call server to create room
      const res = await liveApi.createRoom({
        title: title.trim(),
        category: category.toLowerCase(),
        mode,
      });

      // 2. Set room state in store
      useLiveRoomStore.getState().setRoomData({
        room: res.room,
        host: res.host,
        seats: res.seats,
        isHost: true,
      });

      // 3. Connect to LiveKit SFU Cloud and publish tracks
      await liveKitService.connectRoom(res.livekit_url, res.token, true);

      // 4. Navigate to live room
      router.replace({
        pathname: `/live/${res.room.id}` as any,
        params: { isHost: 'true' },
      });
    } catch (err: any) {
      setToastMessage(err?.message || 'Failed to start live stream');
    } finally {
      setLoading(false);
    }
  };

  const toggleCameraFacing = () => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  };

  // Verification gate: unverified users see a blocking panel instead of the
  // go-live form, mirroring the web GoLive gate.
  if (user && !isApprovedHost) {
    const gateTitle =
      hostStatus === 'pending' ? 'Verification Under Review'
      : hostStatus === 'suspended' ? 'Host Account Suspended'
      : hostStatus === 'rejected' ? 'Verification Rejected'
      : 'Host Verification Required';
    const gateBody =
      hostStatus === 'pending' ? 'Your verification has been submitted and is currently under review by the admin team. You can go live once approved.'
      : hostStatus === 'suspended' ? 'Your host broadcasting privileges have been suspended by admin.'
      : hostStatus === 'rejected' ? 'Your verification was rejected. Please contact your agency or support to re-apply.'
      : 'To start live streaming and earn diamonds, complete host identity verification first.';
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={gateStyles.container}>
          <Text style={gateStyles.icon}>🛡️</Text>
          <Text style={gateStyles.title}>{gateTitle}</Text>
          <Text style={gateStyles.body}>{gateBody}</Text>
          <TouchableOpacity style={gateStyles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={gateStyles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Camera Preview Background */}
      {permissionGranted && mode === 'live' ? (
        <CameraView style={StyleSheet.absoluteFill} facing={facing} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.audioModeBackground]} />
      )}

      {/* Dark luxury gradient overlay */}
      <View style={[StyleSheet.absoluteFill, styles.overlay]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>

          <View style={styles.modeSelector}>
            <TouchableOpacity
              onPress={() => setMode('live')}
              style={[styles.modeTab, mode === 'live' && styles.modeTabActive]}
            >
              <Text style={[styles.modeText, mode === 'live' && styles.modeTextActive]}>
                🎥 Video Live
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMode('audio')}
              style={[styles.modeTab, mode === 'audio' && styles.modeTabActive]}
            >
              <Text style={[styles.modeText, mode === 'audio' && styles.modeTextActive]}>
                🎙️ Audio Party
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'live' && (
            <TouchableOpacity
              style={styles.flipBtn}
              onPress={toggleCameraFacing}
              activeOpacity={0.8}
            >
              <Text style={styles.flipIcon}>🔄</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Center configuration Card */}
        <ScrollView
          contentContainerStyle={styles.centerContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.setupCard}>
            <Text style={styles.cardHeader}>Stream Setup</Text>

            <TextInput
              style={styles.titleInput}
              placeholder="Give your broadcast a catchy title..."
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              maxLength={60}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.sectionLabel}>Select Category</Text>
            <View style={styles.categoryWrap}>
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.categoryChip,
                      isSelected && styles.categoryChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Bottom start button */}
        <View style={styles.bottomBar}>
          <Button
            title="Start Live Broadcast"
            variant="gold"
            size="lg"
            loading={loading}
            onPress={handleStartStream}
            style={styles.startBtn}
          />
        </View>
      </KeyboardAvoidingView>

      <Toast
        visible={!!toastMessage}
        message={toastMessage || ''}
        type="error"
        onHide={() => setToastMessage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  audioModeBackground: {
    backgroundColor: '#0E1322',
  },
  overlay: {
    backgroundColor: 'rgba(7, 9, 14, 0.55)',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    zIndex: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: typography.weights.bold,
  },
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    borderRadius: radii.full,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modeTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  modeTabActive: {
    backgroundColor: colors.gold.primary,
  },
  modeText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: typography.weights.bold,
  },
  modeTextActive: {
    color: '#07090E',
  },
  flipBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: 'rgba(7, 9, 14, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipIcon: {
    fontSize: 16,
  },
  centerContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  setupCard: {
    backgroundColor: 'rgba(14, 19, 34, 0.88)',
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.gold.border,
  },
  cardHeader: {
    color: colors.gold.light,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.md,
  },
  titleInput: {
    backgroundColor: 'rgba(7, 9, 14, 0.6)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: 'rgba(7, 9, 14, 0.6)',
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  categoryChipSelected: {
    backgroundColor: colors.gold.primary,
    borderColor: colors.gold.primary,
  },
  categoryChipText: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
  categoryChipTextSelected: {
    color: '#07090E',
    fontWeight: typography.weights.bold,
  },
  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  startBtn: {
    width: '100%',
  },
});


const gateStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background.base },
  icon: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text.primary, textAlign: 'center', marginBottom: spacing.sm },
  body: { fontSize: typography.sizes.md, color: colors.text.secondary, textAlign: 'center', lineHeight: typography.lineHeights.md, marginBottom: spacing.lg },
  backBtn: { backgroundColor: colors.gold.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.full },
  backBtnText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.text.inverse },
});
